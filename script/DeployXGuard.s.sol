// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {DemoToken} from "../src/DemoToken.sol";
import {HookDeployer} from "../src/HookDeployer.sol";
import {XGuardHook} from "../src/XGuardHook.sol";
import {XGuardDemoRouter} from "../src/XGuardDemoRouter.sol";

contract DeployXGuard is Script {
    using PoolIdLibrary for PoolKey;

    address internal constant XLAYER_POOL_MANAGER = 0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32;
    address internal constant XLAYER_STATE_VIEW = 0x76Fd297e2D437cd7f76d50F01AfE6160f86e9990;
    uint160 internal constant HOOK_FLAGS = Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG;
    uint160 internal constant SQRT_PRICE_1_1 = 79_228_162_514_264_337_593_543_950_336;

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);
        IPoolManager manager = IPoolManager(XLAYER_POOL_MANAGER);

        vm.startBroadcast(privateKey);

        DemoToken xgm = new DemoToken("XGuard Meme", "XGM", deployer);
        DemoToken gusd = new DemoToken("Guard USD", "gUSD", deployer);
        HookDeployer hookDeployer = new HookDeployer();
        XGuardHook hook = _deployHook(hookDeployer, manager, deployer);

        (Currency currency0, Currency currency1) = address(xgm) < address(gusd)
            ? (Currency.wrap(address(xgm)), Currency.wrap(address(gusd)))
            : (Currency.wrap(address(gusd)), Currency.wrap(address(xgm)));

        PoolKey memory key = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        PoolId poolId = key.toId();

        hook.registerPool(key, 1_000_000 ether);
        manager.initialize(key, SQRT_PRICE_1_1);

        XGuardDemoRouter router = new XGuardDemoRouter(manager, xgm, gusd, key, deployer);
        xgm.setMinter(address(router));
        gusd.setMinter(address(router));

        xgm.mint(deployer, 10_000_000 ether);
        gusd.mint(deployer, 10_000_000 ether);
        xgm.approve(address(router), type(uint256).max);
        gusd.approve(address(router), type(uint256).max);
        router.addInitialLiquidity(-887_220, 887_220, 2_000_000 ether);

        vm.stopBroadcast();

        string memory json = "deployment";
        vm.serializeUint(json, "chainId", 196);
        vm.serializeAddress(json, "poolManager", address(manager));
        vm.serializeAddress(json, "stateView", XLAYER_STATE_VIEW);
        vm.serializeAddress(json, "hookDeployer", address(hookDeployer));
        vm.serializeAddress(json, "xguardHook", address(hook));
        vm.serializeAddress(json, "demoRouter", address(router));
        vm.serializeAddress(json, "xgm", address(xgm));
        vm.serializeAddress(json, "gUsd", address(gusd));
        vm.serializeBytes32(json, "poolId", PoolId.unwrap(poolId));
        vm.serializeAddress(json, "currency0", Currency.unwrap(currency0));
        vm.serializeAddress(json, "currency1", Currency.unwrap(currency1));
        string memory finalJson = vm.serializeUint(json, "deployedAt", block.timestamp);
        vm.writeJson(finalJson, "deployments/xlayer-mainnet.json");
        vm.writeJson(finalJson, "public/deployments/xlayer-mainnet.json");
    }

    function _deployHook(HookDeployer hookDeployer, IPoolManager manager, address owner) internal returns (XGuardHook hook) {
        bytes memory constructorArgs = abi.encode(manager, owner);
        bytes memory initCode = abi.encodePacked(type(XGuardHook).creationCode, constructorArgs);
        (address hookAddress, bytes32 salt) = _mineHookAddress(address(hookDeployer), initCode);

        if (hookAddress.code.length == 0) {
            address deployed = hookDeployer.deploy(salt, initCode);
            require(deployed == hookAddress, "HOOK_ADDRESS_MISMATCH");
        }

        hook = XGuardHook(hookAddress);
    }

    function _mineHookAddress(address hookDeployer, bytes memory initCode)
        internal
        pure
        returns (address hookAddress, bytes32 salt)
    {
        for (uint256 i; i < 160_444; i++) {
            salt = bytes32(i);
            hookAddress = address(
                uint160(
                    uint256(keccak256(abi.encodePacked(bytes1(0xff), hookDeployer, salt, keccak256(initCode))))
                )
            );
            if (uint160(hookAddress) & Hooks.ALL_HOOK_MASK == HOOK_FLAGS) return (hookAddress, salt);
        }
        revert("HOOK_SALT_NOT_FOUND");
    }
}
