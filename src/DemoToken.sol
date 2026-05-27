// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract DemoToken is ERC20, Ownable {
    address public minter;

    error NotMinter();

    constructor(string memory name_, string memory symbol_, address owner_) ERC20(name_, symbol_) Ownable(owner_) {}

    function setMinter(address minter_) external onlyOwner {
        minter = minter_;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter && msg.sender != owner()) revert NotMinter();
        _mint(to, amount);
    }
}
