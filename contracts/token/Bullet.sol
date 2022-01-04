// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title Bullet Token
 *
 * @dev A minimal ERC20 token contract for the Bullet token.
 */
contract Bullet is ERC20 {
    uint256 public optionID;
    address public controller;

    /**
     * @dev Throws if called by any account other than the controller.
     */
    modifier onlyController() {
        require(msg.sender == controller, "Bullet: caller is not the controller");
        _;
    }

    constructor() ERC20("Bullet token", "BLT") {}

    // called once by the factory at time of deployment
    function initialize(uint256 _optionID, address _controller) external {
        require(_controller != address(0), "Bullet: zero address");
        optionID = _optionID;
        controller = _controller;
    }

    function mintFor(address _account, uint256 _amount) external onlyController {
        _mint(_account, _amount);
    }

    function burn(uint256 amount) external onlyController {
        _burn(_msgSender(), amount);
    }

    function burnFrom(address account, uint256 amount) external onlyController {
        uint256 currentAllowance = allowance(account, _msgSender());
        require(currentAllowance >= amount, "ERC20: burn amount exceeds allowance");
        unchecked {
            _approve(account, _msgSender(), currentAllowance - amount);
        }
        _burn(account, amount);
    }
}
