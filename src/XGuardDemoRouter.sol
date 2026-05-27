// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {DemoToken} from "./DemoToken.sol";

contract XGuardDemoRouter is IUnlockCallback, Ownable {
    using SafeERC20 for IERC20;
    using BalanceDeltaLibrary for BalanceDelta;

    uint256 public constant NORMAL_SWAP_AMOUNT = 10 ether;
    uint256 public constant LARGE_SWAP_AMOUNT = 60_000 ether;

    enum Action {
        AddLiquidity,
        SwapExactInput
    }

    IPoolManager public immutable manager;
    DemoToken public immutable demoTokenA;
    DemoToken public immutable demoTokenB;
    PoolKey public poolKey;

    mapping(address user => bool claimed) public faucetClaimed;

    event FaucetClaimed(address indexed user, uint256 amountA, uint256 amountB);
    event DemoSwap(address indexed user, bool zeroForOne, uint256 amountIn, uint256 amountOut);
    event DemoLiquidityAdded(address indexed provider, int24 tickLower, int24 tickUpper, int256 liquidityDelta);

    error OnlyPoolManager();
    error FaucetAlreadyClaimed();
    error InsufficientAmountOut(uint256 amountOut, uint256 minAmountOut);

    constructor(IPoolManager manager_, DemoToken tokenA_, DemoToken tokenB_, PoolKey memory key_, address owner_)
        Ownable(owner_)
    {
        manager = manager_;
        demoTokenA = tokenA_;
        demoTokenB = tokenB_;
        poolKey = key_;
    }

    function faucet() external {
        if (faucetClaimed[msg.sender]) revert FaucetAlreadyClaimed();
        faucetClaimed[msg.sender] = true;
        uint256 amountA = 500_000 ether;
        uint256 amountB = 500_000 ether;
        demoTokenA.mint(msg.sender, amountA);
        demoTokenB.mint(msg.sender, amountB);
        emit FaucetClaimed(msg.sender, amountA, amountB);
    }

    function addInitialLiquidity(int24 tickLower, int24 tickUpper, int256 liquidityDelta) external onlyOwner {
        ModifyLiquidityParams memory params =
            ModifyLiquidityParams({tickLower: tickLower, tickUpper: tickUpper, liquidityDelta: liquidityDelta, salt: 0});
        manager.unlock(abi.encode(Action.AddLiquidity, msg.sender, params));
        emit DemoLiquidityAdded(msg.sender, tickLower, tickUpper, liquidityDelta);
    }

    function swapExactInput(bool zeroForOne, uint256 amountIn, uint256 minAmountOut)
        external
        returns (uint256 amountOut)
    {
        amountOut = _swapExactInput(msg.sender, zeroForOne, amountIn, minAmountOut);
    }

    function demoNormalSwap() external returns (uint256 amountOut) {
        amountOut = _swapExactInput(msg.sender, true, NORMAL_SWAP_AMOUNT, 0);
    }

    function demoLargeSwap() external returns (uint256 amountOut) {
        amountOut = _swapExactInput(msg.sender, true, LARGE_SWAP_AMOUNT, 0);
    }

    function demoStressSwap() external returns (uint256 totalAmountOut) {
        for (uint256 i; i < 3; i++) {
            totalAmountOut += _swapExactInput(msg.sender, true, LARGE_SWAP_AMOUNT, 0);
        }
    }

    function _swapExactInput(address payer, bool zeroForOne, uint256 amountIn, uint256 minAmountOut)
        private
        returns (uint256 amountOut)
    {
        SwapParams memory params = SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -int256(amountIn),
            sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
        });

        amountOut = abi.decode(
            manager.unlock(abi.encode(Action.SwapExactInput, payer, params, minAmountOut)), (uint256)
        );
        emit DemoSwap(payer, zeroForOne, amountIn, amountOut);
    }

    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        if (msg.sender != address(manager)) revert OnlyPoolManager();
        Action action = abi.decode(rawData, (Action));

        if (action == Action.AddLiquidity) {
            (, address liquidityPayer, ModifyLiquidityParams memory liquidityParams) =
                abi.decode(rawData, (Action, address, ModifyLiquidityParams));
            (BalanceDelta delta,) = manager.modifyLiquidity(poolKey, liquidityParams, "");
            _settleDelta(liquidityPayer, delta);
            return "";
        }

        (, address swapPayer, SwapParams memory swapParams, uint256 minAmountOut) =
            abi.decode(rawData, (Action, address, SwapParams, uint256));
        BalanceDelta swapDelta = manager.swap(poolKey, swapParams, "");
        uint256 amountOut = _settleDelta(swapPayer, swapDelta);
        if (amountOut < minAmountOut) revert InsufficientAmountOut(amountOut, minAmountOut);
        return abi.encode(amountOut);
    }

    function _settleDelta(address payer, BalanceDelta delta) private returns (uint256 amountOut) {
        int128 amount0 = delta.amount0();
        int128 amount1 = delta.amount1();

        if (amount0 < 0) _settle(poolKey.currency0, payer, uint128(-amount0));
        if (amount1 < 0) _settle(poolKey.currency1, payer, uint128(-amount1));
        if (amount0 > 0) {
            _take(poolKey.currency0, payer, uint128(amount0));
            amountOut = uint128(amount0);
        }
        if (amount1 > 0) {
            _take(poolKey.currency1, payer, uint128(amount1));
            amountOut = uint128(amount1);
        }
    }

    function _settle(Currency currency, address payer, uint256 amount) private {
        manager.sync(currency);
        IERC20(Currency.unwrap(currency)).safeTransferFrom(payer, address(manager), amount);
        manager.settle();
    }

    function _take(Currency currency, address recipient, uint256 amount) private {
        manager.take(currency, recipient, amount);
    }
}
