// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
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

    event RiskUpdated(PoolId indexed poolId, RiskState state, uint256 score);
    event FeeAdjusted(PoolId indexed poolId, uint24 oldFee, uint24 newFee, uint256 score);
    event LargeSwapDetected(PoolId indexed poolId, address indexed sender, uint256 amount, uint256 impactBps);

    error XGuardSwapBlocked(bytes32 poolId, uint256 riskScore, uint256 amountIn);
    error PoolMustUseDynamicFee();
    error ReferenceLiquidityRequired();

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
        if (key.fee != LPFeeLibrary.DYNAMIC_FEE_FLAG) revert PoolMustUseDynamicFee();
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

    function setPoolConfig(PoolKey calldata key, PoolConfig calldata config) external onlyOwner {
        PoolId poolId = key.toId();
        poolConfigs[poolId] = config;
        PoolRisk storage risk = _ensurePool(poolId);
        risk.currentFee = _feeForScore(config, risk.score);
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

    function previewRisk(PoolId poolId, bool zeroForOne, uint256 amountIn)
        external
        view
        returns (uint256 predictedScore, uint24 predictedFee, bool willBlock)
    {
        PoolRisk storage risk = poolRisks[poolId];
        PoolConfig memory config = poolConfigs[poolId];
        if (config.baseFee == 0) config = defaultConfig();

        uint128 referenceLiquidity = risk.referenceLiquidity == 0 ? 1_000_000 ether : risk.referenceLiquidity;
        uint256 impactBps = amountIn * 10_000 / referenceLiquidity;
        predictedScore = _decayedScore(risk, config);
        willBlock = impactBps >= config.hardBlockBps;
        if (!willBlock && impactBps >= config.largeSwapBps) {
            predictedScore = _min(predictedScore + 45, 200);
            bool sameDirection = risk.lastDirection == zeroForOne;
            if (sameDirection && risk.consecutiveLargeSwaps + 1 >= config.consecutiveSwapThreshold) {
                predictedScore = _min(predictedScore + 40, 200);
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
        uint256 impactBps = amount * 10_000 / risk.referenceLiquidity;
        if (impactBps >= config.hardBlockBps) _blockSwap(poolId, amount, risk.score);

        bool isLarge = impactBps >= config.largeSwapBps;
        bool sameDirection = risk.lastDirection == params.zeroForOne;

        uint256 addedScore;
        if (isLarge) {
            addedScore += 45;
            emit LargeSwapDetected(poolId, sender, amount, impactBps);
            risk.consecutiveLargeSwaps =
                sameDirection && risk.consecutiveLargeSwaps < type(uint8).max ? risk.consecutiveLargeSwaps + 1 : 1;
        } else {
            risk.consecutiveLargeSwaps = 0;
        }

        if (isLarge && sameDirection && risk.consecutiveLargeSwaps >= config.consecutiveSwapThreshold) addedScore += 40;
        if (addedScore > 0) risk.score = _min(risk.score + addedScore, 200);
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
