// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

contract XGuardHook is BaseHook, Ownable {
    using PoolIdLibrary for PoolKey;

    enum RiskState {
        Normal,
        Warning,
        Protected
    }

    struct PoolRisk {
        RiskState state;
        uint256 score;
        uint24 currentFee;
        uint256 lastUpdatedBlock;
        bool lastDirection;
        uint8 consecutiveLargeSwaps;
        uint128 referenceLiquidity;
        bool initialized;
    }

    struct PoolConfig {
        uint16 largeSwapBps;
        uint16 hardBlockBps;
        uint8 consecutiveSwapThreshold;
        uint16 warningScore;
        uint16 protectedScore;
        uint16 decayPerBlock;
        uint24 baseFee;
        uint24 warningFee;
        uint24 protectedFee;
    }

    // previewRisk 和 _applySwapRisk 必须用同一套打分规则，否则「预览」会和真实结果对不上。
    uint256 private constant LARGE_SWAP_SCORE = 45;
    uint256 private constant CONSECUTIVE_LARGE_SWAP_SCORE = 40;
    uint256 private constant MAX_RISK_SCORE = 200;

    event RiskUpdated(PoolId indexed poolId, RiskState state, uint256 score);
    event FeeAdjusted(PoolId indexed poolId, uint24 oldFee, uint24 newFee, uint256 score);
    event LargeSwapDetected(PoolId indexed poolId, address indexed sender, uint256 amount, uint256 impactBps);
    event ReferenceLiquidityUpdated(PoolId indexed poolId, uint128 referenceLiquidity);

    error XGuardSwapBlocked(bytes32 poolId, uint256 riskScore, uint256 amountIn);
    error PoolMustUseDynamicFee();
    error PoolMustUseThisHook();
    error ReferenceLiquidityRequired();
    error InvalidPoolConfig();

    mapping(PoolId poolId => PoolRisk risk) private poolRisks;
    mapping(PoolId poolId => PoolConfig config) private poolConfigs;

    constructor(IPoolManager manager, address owner_) BaseHook(manager) Ownable(owner_) {}

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function defaultConfig() public pure returns (PoolConfig memory) {
        return PoolConfig({
            largeSwapBps: 300,
            hardBlockBps: 800,
            consecutiveSwapThreshold: 3,
            warningScore: 40,
            protectedScore: 100,
            decayPerBlock: 5,
            baseFee: 3_000,
            warningFee: 10_000,
            protectedFee: 30_000
        });
    }

    function registerPool(PoolKey calldata key, uint128 referenceLiquidity) external onlyOwner {
        _validatePoolKey(key);
        if (referenceLiquidity == 0) revert ReferenceLiquidityRequired();

        PoolId poolId = key.toId();
        PoolConfig memory config = defaultConfig();
        poolConfigs[poolId] = config;

        PoolRisk storage risk = poolRisks[poolId];
        risk.state = RiskState.Normal;
        risk.score = 0;
        risk.currentFee = config.baseFee;
        risk.lastUpdatedBlock = block.number;
        risk.lastDirection = false;
        risk.consecutiveLargeSwaps = 0;
        risk.referenceLiquidity = referenceLiquidity;
        risk.initialized = true;

        emit RiskUpdated(poolId, RiskState.Normal, 0);
    }

    // 调整流动性基准的唯一安全入口。不能复用 registerPool：那个的语义是初始化，
    // 会把 config 打回 defaultConfig 并把 score/state/连续计数一并清零，
    // 拿它调基准就等于顺手抹掉 owner 设过的阈值和池子当前的告警。
    function setReferenceLiquidity(PoolKey calldata key, uint128 referenceLiquidity) external onlyOwner {
        _validatePoolKey(key);
        if (referenceLiquidity == 0) revert ReferenceLiquidityRequired();

        PoolId poolId = key.toId();
        PoolRisk storage risk = _ensurePool(poolId);
        risk.referenceLiquidity = referenceLiquidity;

        emit ReferenceLiquidityUpdated(poolId, referenceLiquidity);
    }

    function setPoolConfig(PoolKey calldata key, PoolConfig calldata config) external onlyOwner {
        _validatePoolKey(key);
        // baseFee doubles as the "pool has no config" sentinel in getPoolConfig and _beforeSwap,
        // so a zero here would silently discard the whole config instead of taking effect.
        if (config.baseFee == 0) revert InvalidPoolConfig();

        PoolId poolId = key.toId();
        // Initialize before writing: _ensurePool seeds defaultConfig on first touch and would
        // otherwise clobber the config this call just supplied.
        PoolRisk storage risk = _ensurePool(poolId);
        poolConfigs[poolId] = config;
        risk.currentFee = _feeForScore(config, risk.score);
    }

    function _validatePoolKey(PoolKey calldata key) private view {
        if (key.fee != LPFeeLibrary.DYNAMIC_FEE_FLAG) revert PoolMustUseDynamicFee();
        // A key pointing at a different hook would store risk state under a poolId this hook
        // never gets called for, leaving the real pool on the _ensurePool fallback liquidity.
        if (key.hooks != IHooks(address(this))) revert PoolMustUseThisHook();
    }

    function getPoolRisk(PoolId poolId)
        external
        view
        returns (RiskState state, uint256 score, uint24 currentFee, uint256 lastUpdatedBlock)
    {
        PoolRisk storage risk = poolRisks[poolId];
        return (risk.state, risk.score, risk.currentFee, risk.lastUpdatedBlock);
    }

    function getPoolConfig(PoolId poolId) external view returns (PoolConfig memory) {
        PoolConfig memory config = poolConfigs[poolId];
        if (config.baseFee == 0) return defaultConfig();
        return config;
    }

    function getReferenceLiquidity(PoolId poolId) external view returns (uint128) {
        return poolRisks[poolId].referenceLiquidity;
    }

    // 冲击计算的分母。优先用链上实时流动性：referenceLiquidity 只是注册时写死的估计，
    // LP 进出后它就和现实脱节，而且是往危险的那边脱——池子缩水时同一笔交易算出的
    // impactBps 偏小，本该硬拦的会漏掉，页面上还看不出任何异常。
    // live 为 0 说明池子还没加流动性（或该 poolId 从未初始化），退回注册基准，
    // 同时避免除零。
    function _effectiveLiquidity(PoolId poolId, PoolRisk storage risk) private view returns (uint256) {
        uint128 live = StateLibrary.getLiquidity(poolManager, poolId);
        if (live > 0) return live;
        if (risk.referenceLiquidity > 0) return risk.referenceLiquidity;
        return 1_000_000 ether;
    }

    function previewRisk(PoolId poolId, bool zeroForOne, uint256 amountIn)
        external
        view
        returns (uint256 predictedScore, uint24 predictedFee, bool willBlock)
    {
        PoolRisk storage risk = poolRisks[poolId];
        PoolConfig memory config = poolConfigs[poolId];
        if (config.baseFee == 0) config = defaultConfig();

        uint256 impactBps = amountIn * 10_000 / _effectiveLiquidity(poolId, risk);
        predictedScore = _decayedScore(risk, config);
        willBlock = impactBps >= config.hardBlockBps;
        if (!willBlock && impactBps >= config.largeSwapBps) {
            // 必须在加分之前判断：_applySwapRisk 在分数衰减到 0 时会重置计数，
            // 预览不跟着重置就会和真实结果对不上。
            bool chainIntact = predictedScore != 0;
            predictedScore = _min(predictedScore + LARGE_SWAP_SCORE, MAX_RISK_SCORE);
            bool sameDirection = risk.lastDirection == zeroForOne;
            if (chainIntact && sameDirection && risk.consecutiveLargeSwaps + 1 >= config.consecutiveSwapThreshold) {
                predictedScore = _min(predictedScore + CONSECUTIVE_LARGE_SWAP_SCORE, MAX_RISK_SCORE);
            }
        }
        predictedFee = _feeForScore(config, predictedScore);
    }

    function getRiskLabel(PoolId poolId) external view returns (string memory) {
        RiskState state = poolRisks[poolId].state;
        if (state == RiskState.Warning) return "Warning";
        if (state == RiskState.Protected) return "Protected";
        return "Normal";
    }

    function _beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId poolId = key.toId();
        PoolRisk storage risk = _ensurePool(poolId);
        PoolConfig memory config = poolConfigs[poolId];
        if (config.baseFee == 0) config = defaultConfig();

        _decay(risk, config);

        _applySwapRisk(poolId, risk, config, sender, params);
        _refreshStateAndFee(poolId, risk, config);

        risk.lastDirection = params.zeroForOne;
        risk.lastUpdatedBlock = block.number;

        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, risk.currentFee | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    function _applySwapRisk(
        PoolId poolId,
        PoolRisk storage risk,
        PoolConfig memory config,
        address sender,
        SwapParams calldata params
    ) private {
        uint256 amount = _absoluteAmount(params.amountSpecified);
        uint256 impactBps = amount * 10_000 / _effectiveLiquidity(poolId, risk);
        if (impactBps >= config.hardBlockBps) _blockSwap(poolId, amount, risk.score);

        bool isLarge = impactBps >= config.largeSwapBps;
        bool sameDirection = risk.lastDirection == params.zeroForOne;

        // _decay() 已经跑过：分数归零说明风险已经恢复，之前那串同向大额 swap
        // 不再算「连续」，否则隔很久的两笔大额也能凑够阈值。
        if (risk.score == 0) risk.consecutiveLargeSwaps = 0;

        uint256 addedScore;
        if (isLarge) {
            addedScore += LARGE_SWAP_SCORE;
            emit LargeSwapDetected(poolId, sender, amount, impactBps);
            risk.consecutiveLargeSwaps =
                sameDirection && risk.consecutiveLargeSwaps < type(uint8).max ? risk.consecutiveLargeSwaps + 1 : 1;
        } else {
            risk.consecutiveLargeSwaps = 0;
        }

        if (isLarge && sameDirection && risk.consecutiveLargeSwaps >= config.consecutiveSwapThreshold) {
            addedScore += CONSECUTIVE_LARGE_SWAP_SCORE;
        }
        if (addedScore > 0) risk.score = _min(risk.score + addedScore, MAX_RISK_SCORE);
    }

    function _blockSwap(PoolId poolId, uint256 amount, uint256 score) private pure {
        revert XGuardSwapBlocked(PoolId.unwrap(poolId), score, amount);
    }

    function _afterSwap(address, PoolKey calldata key, SwapParams calldata, BalanceDelta, bytes calldata)
        internal
        override
        returns (bytes4, int128)
    {
        PoolId poolId = key.toId();
        PoolRisk storage risk = _ensurePool(poolId);
        risk.lastUpdatedBlock = block.number;
        emit RiskUpdated(poolId, risk.state, risk.score);
        return (IHooks.afterSwap.selector, 0);
    }

    function _ensurePool(PoolId poolId) private returns (PoolRisk storage risk) {
        risk = poolRisks[poolId];
        if (!risk.initialized) {
            PoolConfig memory config = defaultConfig();
            poolConfigs[poolId] = config;
            risk.state = RiskState.Normal;
            risk.currentFee = config.baseFee;
            risk.lastUpdatedBlock = block.number;
            risk.referenceLiquidity = 1_000_000 ether;
            risk.initialized = true;
        }
    }

    function _decay(PoolRisk storage risk, PoolConfig memory config) private {
        risk.score = _decayedScore(risk, config);
    }

    function _decayedScore(PoolRisk storage risk, PoolConfig memory config) private view returns (uint256) {
        if (risk.lastUpdatedBlock == 0 || block.number <= risk.lastUpdatedBlock || risk.score == 0) return risk.score;
        uint256 decayAmount = (block.number - risk.lastUpdatedBlock) * config.decayPerBlock;
        return decayAmount >= risk.score ? 0 : risk.score - decayAmount;
    }

    function _refreshStateAndFee(PoolId poolId, PoolRisk storage risk, PoolConfig memory config) private {
        RiskState oldState = risk.state;
        uint24 oldFee = risk.currentFee;

        if (risk.score >= config.protectedScore) risk.state = RiskState.Protected;
        else if (risk.score >= config.warningScore) risk.state = RiskState.Warning;
        else risk.state = RiskState.Normal;

        risk.currentFee = _feeForScore(config, risk.score);
        if (oldFee != risk.currentFee) emit FeeAdjusted(poolId, oldFee, risk.currentFee, risk.score);
        if (oldState != risk.state || oldFee != risk.currentFee) emit RiskUpdated(poolId, risk.state, risk.score);
    }

    function _feeForScore(PoolConfig memory config, uint256 score) private pure returns (uint24) {
        if (score >= config.protectedScore) return config.protectedFee;
        if (score >= config.warningScore) return config.warningFee;
        return config.baseFee;
    }

    function _absoluteAmount(int256 amountSpecified) private pure returns (uint256) {
        return uint256(amountSpecified < 0 ? -amountSpecified : amountSpecified);
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}
