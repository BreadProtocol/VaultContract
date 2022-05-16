// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20 } from "./interfaces/IERC20.sol";
import { SafeTransferLib } from "@rari-capital/solmate/src/utils/SafeTransferLib.sol";
import "./interfaces/OneSplitAudit.sol";
import "./interfaces/Strategy.sol";
import "./interfaces/Converter.sol";

contract Controller {
    address public governance;
    address public strategist;

    address public onesplit;
    address public rewards;
    mapping(address => address) public vaults;
    mapping(address => address) public strategies;
    mapping(address => mapping(address => address)) public converters;

    mapping(address => mapping(address => bool)) public approvedStrategies;

    uint256 public split = 500;
    uint256 public constant max = 10000;

    constructor(address _rewards) {
        governance = msg.sender;
        strategist = msg.sender;
        onesplit = address(0x50FDA034C0Ce7a8f7EFDAebDA7Aa7cA21CC1267e);
        rewards = _rewards;
    }

    function setRewards(address _rewards) public {
        require(msg.sender == governance, "!governance");
        rewards = _rewards;
    }

    function setStrategist(address _strategist) public {
        require(msg.sender == governance, "!governance");
        strategist = _strategist;
    }

    function setSplit(uint256 _split) public {
        require(msg.sender == governance, "!governance");
        split = _split;
    }

    function setOneSplit(address _onesplit) public {
        require(msg.sender == governance, "!governance");
        onesplit = _onesplit;
    }

    function setGovernance(address _governance) public {
        require(msg.sender == governance, "!governance");
        governance = _governance;
    }

    function setVault(address _token, address _vault) public {
        require(msg.sender == strategist || msg.sender == governance, "!strategist");
        // making sure _token does not already have a vault in the vaults map
        // do not want to overwrite a vault corresponding to _token
        require(vaults[_token] == address(0), "vault");
        vaults[_token] = _vault;
    }

    function approveStrategy(address _token, address _strategy) public {
        require(msg.sender == governance, "!governance");
        // nested mapping. token address => strategy address => bool
        // my guess is that the strategy already exists, but is not active
        // because the strategy address maps to a default value of false
        // so the strategy is inactive by default
        // this is where we activate the strategy by setting it to true
        // example: go to (https://github.com/yearn/yearn-protocol/tree/develop/contracts/strategies)
        // strategies already exist at the given link.
        // approvedStrategies[DAI] = [StrategyDAI3Pool, StrategyDAI3PoolV2, StrategyDAICurve]
        // approvedStrategies[DAI][StrategyDAI3Pool] is initially false. set it to true
        // approvedStrategies[DAI][StrategyDAI3Pool] = true
        approvedStrategies[_token][_strategy] = true;
    }

    function revokeStrategy(address _token, address _strategy) public {
        require(msg.sender == governance, "!governance");
        approvedStrategies[_token][_strategy] = false;
    }

    function setConverter(
        address _input,
        address _output,
        address _converter
    ) public {
        require(msg.sender == strategist || msg.sender == governance, "!strategist");
        converters[_input][_output] = _converter;
    }

    function setStrategy(address _token, address _strategy) public {
        require(msg.sender == strategist || msg.sender == governance, "!strategist");
        require(approvedStrategies[_token][_strategy] == true, "!approved"); // making sure strategy has been approved

        address _current = strategies[_token]; // _current is the address of the current strategy for _token
        if (_current != address(0)) {
            // my guess is that this is to make sure the strategy exists
            // if the strategy's address is zero, it does not exist
            // so if the current strategy exists, it has assets in it
            // we want to remove our assets from a strategy we are no longer using
            Strategy(_current).withdrawAll();
        }
        // this is where the new strategy is set
        // MY QUESTION is where do we move our assets to this newly set strategy?
        strategies[_token] = _strategy;
    }

    function earn(address _token, uint256 _amount) public {
        address _strategy = strategies[_token];
        address _want = Strategy(_strategy).want();
        if (_want != _token) {
            address converter = converters[_token][_want]; // MY GUESS is _token has different converters depending on _want
            IERC20(_token).transfer(converter, _amount);
            _amount = Converter(converter).convert(_strategy);
            IERC20(_want).transfer(_strategy, _amount);
            // DO NOT KNOW why we call Strategy.deposit() in the ELSE case but not in the IF case
        } else {
            IERC20(_token).transfer(_strategy, _amount);
            Strategy(_strategy).deposit();
        }
    }

    function balanceOf(address _token) external view returns (uint256) {
        return Strategy(strategies[_token]).balanceOf();
    }

    function withdrawAll(address _token) public {
        require(msg.sender == strategist || msg.sender == governance, "!strategist");
        Strategy(strategies[_token]).withdrawAll();
    }

    function inCaseTokensGetStuck(address _token, uint256 _amount) public {
        require(msg.sender == strategist || msg.sender == governance, "!governance");
        IERC20(_token).transfer(msg.sender, _amount);
    }

    function inCaseStrategyTokenGetStuck(address _strategy, address _token) public {
        require(msg.sender == strategist || msg.sender == governance, "!governance");
        Strategy(_strategy).withdraw(_token);
    }

    function getExpectedReturn(
        address _strategy,
        address _token,
        uint256 parts
    ) public view returns (uint256 expected) {
        uint256 _balance = IERC20(_token).balanceOf(_strategy);
        address _want = Strategy(_strategy).want();
        (expected, ) = OneSplitAudit(onesplit).getExpectedReturn(_token, _want, _balance, parts, 0);
    }

    // Only allows to withdraw non-core strategy tokens ~ this is over and above normal yield
    function yearn(
        address _strategy,
        address _token,
        uint256 parts
    ) public {
        require(msg.sender == strategist || msg.sender == governance, "!governance");
        // This contract should never have value in it, but just incase since this is a public call
        uint256 _before = IERC20(_token).balanceOf(address(this));
        Strategy(_strategy).withdraw(_token);
        uint256 _after = IERC20(_token).balanceOf(address(this));
        if (_after > _before) {
            uint256 _amount = _after - _before;
            address _want = Strategy(_strategy).want();
            uint256[] memory _distribution;
            uint256 _expected;
            _before = IERC20(_want).balanceOf(address(this));
            IERC20(_token).approve(onesplit, 0);
            IERC20(_token).approve(onesplit, _amount);
            (_expected, _distribution) = OneSplitAudit(onesplit).getExpectedReturn(_token, _want, _amount, parts, 0);
            OneSplitAudit(onesplit).swap(_token, _want, _amount, _expected, _distribution, 0);
            _after = IERC20(_want).balanceOf(address(this));
            if (_after > _before) {
                _amount = _after - _before;
                uint256 _reward = (_amount * split) / max;
                earn(_want, _amount - _reward);
                IERC20(_want).transfer(rewards, _reward);
            }
        }
    }

    function withdraw(address _token, uint256 _amount) public {
        require(msg.sender == vaults[_token], "!vault");
        Strategy(strategies[_token]).withdraw(_amount);
    }
}
