// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {DemoToken} from "../src/DemoToken.sol";
import {XGuardDemoRouter} from "../src/XGuardDemoRouter.sol";
import {XGuardHook} from "../src/XGuardHook.sol";

contract XGuardDemoFlowTest is Test {
    using PoolIdLibrary for PoolKey;

    uint160 private constant SQRT_PRICE_1_1 = 79228162514264337593543950336;
    uint160 private constant HOOK_FLAGS = uint160(Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG);

    address private trader = makeAddr("trader");

    IPoolManager private manager;
    DemoToken private xgm;
    DemoToken private gusd;
    XGuardHook private hook;
    XGuardDemoRouter private router;
    PoolKey private key;
    PoolId private poolId;

    function setUp() public {
        manager = IPoolManager(address(new PoolManager(address(this))));
        xgm = new DemoToken("XGuard Meme", "XGM", address(this));
        gusd = new DemoToken("Guard USD", "gUSD", address(this));
        hook = _deployHook();

        (Currency currency0, Currency currency1) = _sortCurrencies(xgm, gusd);
        key = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        poolId = key.toId();

        hook.registerPool(key, 1_000_000 ether);
        manager.initialize(key, SQRT_PRICE_1_1);

        router = new XGuardDemoRouter(manager, xgm, gusd, key, address(this));
        xgm.setMinter(address(router));
        gusd.setMinter(address(router));

        xgm.mint(address(this), 10_000_000 ether);
        gusd.mint(address(this), 10_000_000 ether);
        xgm.approve(address(router), type(uint256).max);
        gusd.approve(address(router), type(uint256).max);
        router.addInitialLiquidity(
            TickMath.minUsableTick(key.tickSpacing), TickMath.maxUsableTick(key.tickSpacing), 2_000_000 ether
        );

        vm.startPrank(trader);
        router.faucet();
        xgm.approve(address(router), type(uint256).max);
        gusd.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    function testDemoRouterExecutesRealPoolManagerRiskFlow() public {
        vm.prank(trader);
        uint256 normalAmountOut = router.demoNormalSwap();
        assertGt(normalAmountOut, 0);

        (XGuardHook.RiskState normalState,, uint24 normalFee,) = hook.getPoolRisk(poolId);
        assertEq(uint8(normalState), uint8(XGuardHook.RiskState.Normal));
        assertEq(normalFee, 3_000);

        vm.prank(trader);
        uint256 largeAmountOut = router.demoLargeSwap();
        assertGt(largeAmountOut, 0);

        (XGuardHook.RiskState warningState,, uint24 warningFee,) = hook.getPoolRisk(poolId);
        assertEq(uint8(warningState), uint8(XGuardHook.RiskState.Warning));
        assertEq(warningFee, 10_000);

        vm.prank(trader);
        uint256 stressAmountOut = router.demoStressSwap();
        assertGt(stressAmountOut, 0);

        (XGuardHook.RiskState protectedState, uint256 protectedScore, uint24 protectedFee,) = hook.getPoolRisk(poolId);
        assertEq(uint8(protectedState), uint8(XGuardHook.RiskState.Protected));
        assertGe(protectedScore, 100);
        assertEq(protectedFee, 30_000);
    }

    function testHardThresholdRevertKeepsXGuardReasonInRevertData() public {
        vm.prank(trader);
        (bool success, bytes memory revertData) =
            address(router).call(abi.encodeCall(router.swapExactInput, (true, 90_000 ether, 0)));

        assertFalse(success);
        assertTrue(_containsSelector(revertData, XGuardHook.XGuardSwapBlocked.selector));
    }

    function _deployHook() private returns (XGuardHook deployedHook) {
        bytes memory constructorArgs = abi.encode(manager, address(this));
        (address expectedAddress, bytes32 salt) =
            HookMiner.find(address(this), HOOK_FLAGS, type(XGuardHook).creationCode, constructorArgs);

        deployedHook = new XGuardHook{salt: salt}(manager, address(this));
        assertEq(address(deployedHook), expectedAddress);
    }

    function _sortCurrencies(DemoToken tokenA, DemoToken tokenB) private pure returns (Currency currency0, Currency currency1) {
        if (address(tokenA) < address(tokenB)) {
            return (Currency.wrap(address(tokenA)), Currency.wrap(address(tokenB)));
        }
        return (Currency.wrap(address(tokenB)), Currency.wrap(address(tokenA)));
    }

    function _containsSelector(bytes memory data, bytes4 selector) private pure returns (bool) {
        if (data.length < 4) return false;
        for (uint256 index; index <= data.length - 4; index++) {
            bytes4 candidate;
            assembly ("memory-safe") {
                candidate := mload(add(add(data, 0x20), index))
            }
            if (candidate == selector) return true;
        }
        return false;
    }
}
