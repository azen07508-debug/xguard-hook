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

contract MockPoolManager {}

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
