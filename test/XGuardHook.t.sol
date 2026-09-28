// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {XGuardHook} from "../src/XGuardHook.sol";

contract TestableXGuardHook is XGuardHook {
    constructor(IPoolManager manager, address owner_) XGuardHook(manager, owner_) {}

    function validateHookAddress(BaseHook) internal pure override {}
}

// _effectiveLiquidity 走 StateLibrary.getLiquidity → poolManager.extsload 读真实流动性，
// 所以 Mock 必须实现 extsload，否则所有 swap 都会 revert。
// 这里忽略 slot 直接返回设定值——实验只关心流动性数值本身，不关心存储布局；
// 接真实 PoolManager 时读的才是真正的 pools[poolId].liquidity。
contract MockPoolManager {
    // 默认值对齐 registerPool 使用的 1_000_000 ether 基准，用来验证在基准值上
    // 改动前后的打分行为完全等价。
    uint128 public liveLiquidity = 1_000_000 ether;

    function setLiveLiquidity(uint128 value) external {
        liveLiquidity = value;
    }

    function extsload(bytes32) external view returns (bytes32) {
        return bytes32(uint256(liveLiquidity));
    }

    function exttload(bytes32) external pure returns (bytes32) {
        return bytes32(0);
    }
}

contract XGuardHookTest is Test {
    using PoolIdLibrary for PoolKey;

    MockPoolManager private manager;
    TestableXGuardHook private hook;
    PoolKey private key;
    PoolId private poolId;

    function setUp() public {
        manager = new MockPoolManager();
        hook = new TestableXGuardHook(IPoolManager(address(manager)), address(this));
        key = PoolKey({
            currency0: Currency.wrap(address(0x1000)),
            currency1: Currency.wrap(address(0x2000)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        poolId = key.toId();
        hook.registerPool(key, 1_000_000 ether);
    }

    function testHookPermissionsEnableDynamicRiskCallbacks() public view {
        Hooks.Permissions memory permissions = hook.getHookPermissions();

        assertTrue(permissions.beforeSwap);
        assertTrue(permissions.afterSwap);
        assertFalse(permissions.afterAddLiquidity);
        assertFalse(permissions.beforeSwapReturnDelta);
    }

    function testPoolMustUseDynamicFeeFlag() public {
        PoolKey memory fixedFeeKey = PoolKey({
            currency0: Currency.wrap(address(0x1000)),
            currency1: Currency.wrap(address(0x2000)),
            fee: 3_000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        vm.expectRevert(XGuardHook.PoolMustUseDynamicFee.selector);
        hook.registerPool(fixedFeeKey, 1_000_000 ether);
    }

    function testSmallSwapKeepsPoolNormalAndBaseFee() public {
        (, uint24 fee) = _beforeSwap(1_000 ether, true);

        (XGuardHook.RiskState state, uint256 score, uint24 currentFee,) = hook.getPoolRisk(poolId);
        assertEq(uint8(state), uint8(XGuardHook.RiskState.Normal));
        assertEq(score, 0);
        assertEq(currentFee, 3_000);
        assertEq(fee, 3_000 | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    function testLargeSwapRaisesWarningFee() public {
        (, uint24 fee) = _beforeSwap(60_000 ether, true);

        (XGuardHook.RiskState state, uint256 score, uint24 currentFee,) = hook.getPoolRisk(poolId);
        assertEq(uint8(state), uint8(XGuardHook.RiskState.Warning));
        assertEq(score, 45);
        assertEq(currentFee, 10_000);
        assertEq(fee, 10_000 | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    function testConsecutiveLargeSameDirectionSwapsEnterProtected() public {
        _beforeSwap(60_000 ether, true);
        _beforeSwap(60_000 ether, true);
        _beforeSwap(60_000 ether, true);

        (XGuardHook.RiskState state, uint256 score, uint24 currentFee,) = hook.getPoolRisk(poolId);
        assertEq(uint8(state), uint8(XGuardHook.RiskState.Protected));
        assertGe(score, 100);
        assertEq(currentFee, 30_000);
    }

    function testProtectedSameDirectionLargeSwapKeepsProtectedFeeWithoutBlocking() public {
        _beforeSwap(60_000 ether, true);
        _beforeSwap(60_000 ether, true);
        _beforeSwap(60_000 ether, true);

        (, uint24 fee) = _beforeSwap(60_000 ether, true);

        (XGuardHook.RiskState state,, uint24 currentFee,) = hook.getPoolRisk(poolId);
        assertEq(uint8(state), uint8(XGuardHook.RiskState.Protected));
        assertEq(currentFee, 30_000);
        assertEq(fee, 30_000 | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    function testHardImpactSwapIsBlocked() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                XGuardHook.XGuardSwapBlocked.selector, PoolId.unwrap(poolId), uint256(0), 90_000 ether
            )
        );
        _beforeSwap(90_000 ether, true);
    }

    function testPreviewRiskShowsHardThresholdBlock() public view {
        (uint256 predictedScore, uint24 predictedFee, bool willBlock) = hook.previewRisk(poolId, true, 90_000 ether);

        assertEq(predictedScore, 0);
        assertEq(predictedFee, 3_000);
        assertTrue(willBlock);
    }

    function testRiskLabelReturnsReadableState() public {
        _beforeSwap(60_000 ether, true);

        assertEq(hook.getRiskLabel(poolId), "Warning");
    }

    function testRiskScoreDecaysBackToNormal() public {
        _beforeSwap(60_000 ether, true);

        vm.roll(block.number + 10);
        _beforeSwap(1_000 ether, false);

        (XGuardHook.RiskState state, uint256 score, uint24 currentFee,) = hook.getPoolRisk(poolId);
        assertEq(uint8(state), uint8(XGuardHook.RiskState.Normal));
        assertEq(score, 0);
        assertEq(currentFee, 3_000);
    }

    function testSetPoolConfigBeforeFirstTouchIsNotClobbered() public {
        PoolKey memory freshKey = PoolKey({
            currency0: Currency.wrap(address(0x3000)),
            currency1: Currency.wrap(address(0x4000)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        PoolId freshId = freshKey.toId();

        XGuardHook.PoolConfig memory custom = hook.defaultConfig();
        custom.baseFee = 500;
        custom.warningFee = 20_000;
        hook.setPoolConfig(freshKey, custom);

        XGuardHook.PoolConfig memory stored = hook.getPoolConfig(freshId);
        assertEq(stored.baseFee, 500, "custom baseFee was overwritten by defaultConfig");
        assertEq(stored.warningFee, 20_000, "custom warningFee was overwritten by defaultConfig");
    }

    function testSetPoolConfigRejectsZeroBaseFee() public {
        XGuardHook.PoolConfig memory config = hook.defaultConfig();
        config.baseFee = 0;

        vm.expectRevert(XGuardHook.InvalidPoolConfig.selector);
        hook.setPoolConfig(key, config);
    }

    function testRegisterPoolRejectsKeyPointingAtAnotherHook() public {
        PoolKey memory foreignKey = PoolKey({
            currency0: Currency.wrap(address(0x5000)),
            currency1: Currency.wrap(address(0x6000)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(0xBEEF))
        });

        vm.expectRevert(XGuardHook.PoolMustUseThisHook.selector);
        hook.registerPool(foreignKey, 1_000_000 ether);
    }

    function testSetPoolConfigTakesEffectOnNextSwap() public {
        XGuardHook.PoolConfig memory config = hook.defaultConfig();
        config.baseFee = 500;
        config.warningFee = 20_000;
        hook.setPoolConfig(key, config);

        (, uint24 fee) = _beforeSwap(1_000 ether, true);
        assertEq(fee, 500 | LPFeeLibrary.OVERRIDE_FEE_FLAG);

        _beforeSwap(60_000 ether, true);
        (, uint24 warningFee) = _beforeSwap(1_000 ether, true);
        assertEq(warningFee, 20_000 | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    function testSetReferenceLiquidityKeepsConfigAndRiskState() public {
        XGuardHook.PoolConfig memory config = hook.defaultConfig();
        config.baseFee = 500;
        config.warningFee = 20_000;
        hook.setPoolConfig(key, config);
        _beforeSwap(60_000 ether, true);

        hook.setReferenceLiquidity(key, 500_000 ether);

        assertEq(hook.getReferenceLiquidity(poolId), 500_000 ether);

        XGuardHook.PoolConfig memory stored = hook.getPoolConfig(poolId);
        assertEq(stored.baseFee, 500, "reference update reset config to default");
        assertEq(stored.warningFee, 20_000, "reference update reset config to default");

        (XGuardHook.RiskState state, uint256 score, uint24 currentFee,) = hook.getPoolRisk(poolId);
        assertEq(uint8(state), uint8(XGuardHook.RiskState.Warning), "reference update cleared risk state");
        assertEq(score, 45, "reference update cleared risk score");
        assertEq(currentFee, 20_000, "reference update reset current fee");
    }

    // 有实时流动性时 live 优先：手动改的基准不参与打分
    function testSetReferenceLiquidityDoesNotOverrideLiveLiquidity() public {
        hook.setReferenceLiquidity(key, 50_000 ether);

        // live 是 Mock 默认的 1_000_000，60_000 因此只有 600 bps，低于 800 硬阈值。
        // 若手动基准反而盖过了 live，这一笔会被硬拦。
        (, uint24 fee) = _beforeSwap(60_000 ether, true);
        assertEq(fee, 10_000 | LPFeeLibrary.OVERRIDE_FEE_FLAG, "live liquidity should outrank the manual baseline");
    }

    // 池子还没有流动性（live=0）时才回落到手动基准
    function testSetReferenceLiquidityAppliesWhenPoolHasNoLiquidity() public {
        hook.setReferenceLiquidity(key, 50_000 ether);
        manager.setLiveLiquidity(0);

        // 50_000 基准下 60_000 是 12_000 bps，远超 800
        vm.expectRevert(
            abi.encodeWithSelector(
                XGuardHook.XGuardSwapBlocked.selector, PoolId.unwrap(poolId), uint256(0), 60_000 ether
            )
        );
        _beforeSwap(60_000 ether, true);
    }

    function testSetReferenceLiquidityRejectsZero() public {
        vm.expectRevert(XGuardHook.ReferenceLiquidityRequired.selector);
        hook.setReferenceLiquidity(key, 0);
    }

    function testSetReferenceLiquidityRejectsExternalHookKey() public {
        PoolKey memory foreignKey = PoolKey({
            currency0: Currency.wrap(address(0x5000)),
            currency1: Currency.wrap(address(0x6000)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(0xBEEF))
        });

        vm.expectRevert(XGuardHook.PoolMustUseThisHook.selector);
        hook.setReferenceLiquidity(foreignKey, 1_000_000 ether);
    }

    function testSetReferenceLiquidityRequiresOwner() public {
        address stranger = address(0xDEAD);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", stranger));
        hook.setReferenceLiquidity(key, 500_000 ether);
    }

    function testConsecutiveChainDropsAfterScoreFullyDecays() public {
        _beforeSwap(60_000 ether, true);
        _beforeSwap(60_000 ether, true);

        vm.roll(block.number + 100);
        _beforeSwap(60_000 ether, true);

        // 分数归零后链条断开，这一笔只该 +45；不修的话旧计数撑到阈值会变成 85
        (XGuardHook.RiskState state, uint256 score,,) = hook.getPoolRisk(poolId);
        assertEq(score, 45, "stale consecutive chain survived full decay");
        assertEq(uint8(state), uint8(XGuardHook.RiskState.Warning));
    }

    function testPreviewRiskDropsStaleChainAfterDecay() public {
        _beforeSwap(60_000 ether, true);
        _beforeSwap(60_000 ether, true);

        vm.roll(block.number + 100);

        (uint256 predictedScore, uint24 predictedFee,) = hook.previewRisk(poolId, true, 60_000 ether);
        assertEq(predictedScore, 45, "preview still awarded the stale consecutive bonus");
        assertEq(predictedFee, 10_000);
    }

    function _beforeSwap(uint256 amountIn, bool zeroForOne) private returns (bytes4, uint24) {
        SwapParams memory params = SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -int256(amountIn),
            sqrtPriceLimitX96: 0
        });
        vm.prank(address(manager));
        (bytes4 selector,, uint24 fee) = hook.beforeSwap(address(this), key, params, "");
        return (selector, fee);
    }
}
