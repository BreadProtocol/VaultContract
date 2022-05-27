// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.0;

import { ERC20 } from "@rari-capital/solmate/src/tokens/ERC20.sol";
import { SafeTransferLib } from "@rari-capital/solmate/src/utils/SafeTransferLib.sol";
import { IERC20 } from "./interfaces/IERC20.sol";
import { IERC4626 } from "./interfaces/IERC4626.sol";
import { FixedPointMathLib } from "./utils/FixedPointMath.sol";
import "./interfaces/IController.sol";

import "hardhat/console.sol";

contract Vault is ERC20, IERC4626 {
    using SafeTransferLib for ERC20;
    using FixedPointMathLib for uint256;

    // Float is outstanding shares or AMOUNT?
    uint256 public totalFloat;

    // uint256 public minFloat = 9500;
    uint256 public minFloat = 9990;
    uint256 public constant maxFloat = 10000;

    // TEST TEST TEST TEST TEST TEST TEST TEST - State Variables
    int256 public truflationMock = 1140;
    int256 public yieldMock = 274;
    uint256 public minBuffer = 15000;
    uint256 public collateralRatePreview;
    uint256 public decimalMult = 10000;
    // TEST TEST TEST TEST TEST TEST TEST TEST

    address public controller;
    address public governance;

    ERC20 public immutable asset;

    constructor(
        ERC20 _underlying,
        string memory _name,
        string memory _symbol,
        address _governance,
        address _controller
    ) ERC20(_name, _symbol, _underlying.decimals()) {
        asset = _underlying;
        controller = _controller;
        governance = _governance;
    }


    /*///////////////////////////////////////////////////////////////
                        DEPOSIT/WITHDRAWAL LOGIC
    //////////////////////////////////////////////////////////////*/


    // users wants to deposit a fixed amount of underlying asset to get equivalent shares
    function deposit(uint256 amount, address to) public override returns (uint256 shares) {
        require(collateralCheck(amount, convertToShares(amount)) == true, "UNDER_COLLATERALIZED");
        
        shares = previewDeposit(amount);
        require(shares != 0, "ZERO_SHARES");

        // mint after deposit
        _mint(to, shares);
        // Increase the total float
        /// TASK is this supposed to increase shares?
        
        totalFloat += amount;

        emit Deposit(msg.sender, to, amount, shares);

        asset.safeTransferFrom(msg.sender, address(this), amount);

        afterDeposit(amount);
    }

    // user wants a fixed amount of shares (input)
    //  mint calculates the equivalent amount of underlying asset (output)
    // the output amount is transferred from the user to the vault
    function mint(uint256 shares, address to) public override returns (uint256 amount) {
        // TEMP?
        require(collateralCheck(previewMint(shares), shares) == true, "UNDER_COLLATERALIZED");

        // mint after deposit
        /// @dev amount required needs adjusted for the truflation rate
        _mint(to, amount = previewMint(shares));

        // Increase the total float
        totalFloat += amount;

        emit Deposit(msg.sender, to, amount, shares);

        asset.safeTransferFrom(msg.sender, address(this), amount);

        afterDeposit(amount);
    }

    // user wants to withdraw a fixed amount of underlying asset
    // the equivalent amount of shares is burned
    function withdraw(
        uint256 amount,
        address to,
        address from
    ) public override returns (uint256 shares) {
        // TEMP?
        require(collateralCheck(amount, previewWithdraw(amount)) == true, "UNDER_COLLATERALIZED");

        uint256 allowed = allowance[from][msg.sender];
        if (msg.sender != from && allowed != type(uint256).max) allowance[from][msg.sender] = allowed - shares;

        if (amount > idleFloat()) {
            beforeWithdraw(amount);
        }

        _burn(from, shares = previewWithdraw(amount));

        // After a burn, decrease the total float
        totalFloat -= amount;

        emit Withdraw(from, to, amount, shares);

        asset.safeTransfer(to, amount);
    }

    function withdrawEverything(
        address to,
        address from
    ) public payable returns (uint256 sharesOut) {
        uint256 amount = maxWithdraw(from); // 9999
        uint256 shares = maxRedeem(from); // 1894
        require(collateralCheck(amount, shares) == true, "UNDER_COLLATERALIZED"); 

        uint256 allowed = allowance[from][msg.sender];
        if (msg.sender != from && allowed != type(uint256).max) allowance[from][msg.sender] = allowed - shares;

        if (amount > idleFloat()) {
            beforeWithdraw(amount);
        }

        _burn(from, shares);

        // After a burn, decrease the total float
        totalFloat -= amount;

        emit Withdraw(from, to, amount, shares);

        asset.safeTransfer(to, amount);

        shares = sharesOut;
    }

    // user wants to redeem a fixed amount of shares
    // the equivalent underlying asset is transferred from the vault to the user
    function redeem(
        uint256 shares,
        address to,
        address from
    ) public override returns (uint256 amount) {
        
        require(collateralCheck(convertToAssets(shares), shares) == true, "UNDER_COLLATERALIZED");
        uint256 allowed = allowance[from][msg.sender];

        if (msg.sender != from && allowed != type(uint256).max) allowance[from][msg.sender] = allowed - shares;
        require((amount = previewRedeem(shares)) != 0, "ZERO_ASSETS");

        if (shares > idleFloat()) {
            beforeWithdraw(shares);
        }

        amount = previewRedeem(shares);
        
        _burn(from, shares);

        // After redeem & burn, decrease the total float
        
        totalFloat -= amount;

        emit Withdraw(from, to, amount, shares);

        asset.safeTransfer(to, amount);
    }

    /*///////////////////////////////////////////////////////////////
                         INTERNAL HOOKS LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Example usage of hook. Pull funds from strategy to Vault if needed.
    /// Withdraw at least requested amount to the Vault. Covers withdraw/performance fees of strat. Leaves dust tokens.
    function beforeWithdraw(uint256 amount) internal {
        // ???
        // uint256 _withdraw = (amount + ((amount * 50) / 10000)) - idleFloat();
        // IController(controller).withdraw(address(asset), _withdraw);
    }

    function afterDeposit(uint256 amount) internal {}

    /*///////////////////////////////////////////////////////////////
                        ACCOUNTING LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Sum of idle funds and funds deployed to Strategy.
    function totalAssets() public view override returns (uint256) {
        return idleFloat() + IController(controller).balanceOf(address(asset));
    }

    function assetsOf(address user) public view override returns (uint256) {
        return previewRedeem(balanceOf[user]);
    }

    function assetsPerShare() public view override returns (uint256) {
        return previewRedeem(10**decimals);
    }

    /// @notice Idle funds in Vault, i.e deposits before earn()
    function idleFloat() public view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    /// @notice Available to move to strategy. Leave some tokens idle.
    /// @dev Remember, totalFloat returns ALL shares supply, even if underlying is locked outside of Vault.
    function freeFloat() public view returns (uint256) {
        return (totalFloat * minFloat) / maxFloat;
    }

    /// @notice Optional. Left empty here. (No limit)
    function maxDeposit(address) public pure override returns (uint256) {
        return type(uint256).max;
    }

    /// @notice Optional. Left empty here. (No limit)
    /// @dev amount required needs adjusted for the truflation rate, collateralization rate
    function maxMint(address) public pure override returns (uint256) {
        return type(uint256).max;
    }

    function maxWithdraw(address user) public view override returns (uint256) {
        return assetsOf(user);
    }

    function maxRedeem(address user) public view override returns (uint256) {
        return balanceOf[user];
    }

    /////////////////////////////////////////OLD/////////////////////////////////////////////////
    // mulDivDown() and mulDivUp() is used in the following functions starting with 'preview'
    // I BELIEVE these mulDivDown() and mulDivUp() are equivalent to convertToAssets()
    // and convertToShares() functions as defined in the link below
    // https://soliditydeveloper.com/erc-4626
    // totalSupply is from ERC20 contract.
    // I BELIEVE totalSupply is the total amount of the ERC20 tokens
    // which I BELIEVE is the total supply of minted shares in this case
    // function previewDeposit(uint256 amount) public view override returns (uint256 shares) {
    //     if (totalSupply == 0) {
    //         return amount;
    //     }

    //     return (amount * totalSupply) / totalAssets();
        
    //     // Old function contents...
    //     // uint256 supply = totalSupply;
    //     // return supply == 0 ? amount : amount.mulDivDown(totalSupply, totalAssets());
    // }

    // /// @dev amount required needs adjusted for the truflation rate collateralization rate??
    // function previewMint(uint256 shares) public view override returns (uint256 amount) {
    //     if (totalSupply == 0) {
    //         return shares;
    //     }

    //     return (shares * totalAssets()) / totalSupply;
        
    //     // Old function contents...
    //     // uint256 supply = totalSupply;
    //     // return supply == 0 ? shares : shares.mulDivUp(totalAssets(), totalSupply);
    // }

    // /// @dev amount required needs adjusted for the truflation rate collateralization rate??
    // function previewWithdraw(uint256 amount) public view override returns (uint256 shares) {
    //     uint256 supply = totalSupply;

    //     return supply == 0 ? amount : amount.mulDivUp(totalSupply, totalAssets());
    // }

    // /// @dev amount required needs adjusted for the truflation rate collateralization rate??
    // function previewRedeem(uint256 shares) public view override returns (uint256 amount) {
    //     uint256 supply = totalSupply;

    //     return supply == 0 ? shares : shares.mulDivDown(totalAssets(), totalSupply);
    // }
    /////////////////////////////////////////OLD/////////////////////////////////////////////////


    /////////////////////////OLD/////////////////////////////////
    // function convertToShares(uint256 assets) public view returns (uint256) {
    //     if (totalSupply == 0) {
    //         return assets;
    //     }
    //     return (assets * totalSupply) / totalAssets();
    // }
    // ///////////////////////OLD/////////////////////////////////

    /// USER --> assets/shares --> preview collateral() --> returns MC rate, OC rate --> previewDeposit() /
    /// convertToShares() --> 

    /// @dev TASK may need to make a case for ZERO assets, seems like minimumCollateral() would fail



    /// Old function that needs replicated
    // /// like previewDeposit()
    // function convertToShares(uint256 assets, uint256 shares) public view returns (uint256) {
    //     if (collateralCheck(assets, shares) == false) {
    //         return 0;
    //     }
    //     return shares;
    // }

    /// DESCRIPTION OF TASK
    /// x User sends the assets and shares they want
    /// x calls collateralCheck(assets, shares)
        /// x we get the collateralRatePreview
        /// x then we do a collateralCheck()
        /// x there we'll set the collateralRatePreview
        /// x then we call previewDeposit()
            /// that calls convertToShares()
                /// convert to shares, uses collateralRatePreview to get desired amount of shares

    function minimumCollateral() public view returns (uint256) {
        // INFO this takes the truflation and yield mocks to return the
        // minimum acceptable collateral rate
        if (truflationMock < 0) {
            return (15 * decimalMult) / 10;
        }
        uint256 minimumCollateralRatio = uint256((truflationMock * int256(decimalMult)) / yieldMock);
        // CHORE update this to 1.5 (150%)
        if (minimumCollateralRatio < (15 * decimalMult) / 10) {
            return (15 * decimalMult) / 10;
        }
        return minimumCollateralRatio;
    }
    
    function previewCollateralRate(uint256 assets, uint256 shares) public view returns (uint256) {
        // INFO this takes the assets and desired shares to mint and returns 
        // what the collateral rate would be
        return (((totalAssets() + assets) * decimalMult) / (totalSupply + shares));

    }

    function impliedTokenPrice() public view returns (uint256) {

    }

    function collateralCheck(uint256 assets, uint256 shares) public payable returns (bool) {
        // INFO this returns a TRUE/FALSE to tell whether the desired mint 
        // is sufficiently collateralized
        uint256 _collateralRatePreview = previewCollateralRate(assets, shares);
        if (_collateralRatePreview < minimumCollateral()) {
            return false;
        }
        collateralRatePreview = _collateralRatePreview;
        return true;
    }

    function returnCollateralRatePreview() public view returns (uint256) {
        return collateralRatePreview;
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        // return assets / collateralRatePreview;
        return (assets / collateralRatePreview) * decimalMult;
    }

    /// like previewMint()
    function convertToAssets(uint256 shares) public view returns (uint256) {
        return shares * collateralRatePreview;
        // return (shares * collateralRatePreview) * decimalMult;
    }

    function previewDeposit(uint256 assets) public view override returns (uint256) {
        return convertToShares(assets);
    }

    function previewMint(uint256 shares) public view override returns (uint256) {
        return convertToAssets(shares);
    }

    function previewWithdraw(uint256 assets) public view override returns (uint256) {
        return convertToShares(assets);
    }

    function previewRedeem(uint256 shares) public view override returns (uint256) {
        return convertToAssets(shares) / decimalMult;
    }

    /////////////////////////OLD/////////////////////////////////
    // /// When redeemed, we need to be sure that
    // /// preview doesn't return more shares than are available
    // /// 

    // /// like previewDeposit()
    // function convertToShares(uint256 assets) public view returns (uint256) {
    //     /// @dev this needs to take into account the rest of the collateral too
    //     /// not just the one deposit
    //     if (totalSupply == 0) {
    //         return (assets / minimumCollateral());
    //     }

    //     /// @dev incomplete!
    //     /// this needs to check ...?
    //     return (assets / minimumCollateral());
    // }

    // /// like previewMint()
    // function convertToAssets(uint256 shares) public view returns (uint256) {
    //     if (totalSupply == 0) {
    //         // this should be shares * redemptionRate
    //         return shares * minimumCollateral();
    //     }

    //     return (shares * totalAssets()) / totalSupply;
    // }

    // function previewDeposit(uint256 assets) public view override returns (uint256) {
    //     return convertToShares(assets);
    // }

    // function previewMint(uint256 shares) public view override returns (uint256) {
    //     return convertToAssets(shares);
    // }

    // function previewWithdraw(uint256 assets) public view override returns (uint256) {
    //     return convertToShares(assets);
    // }

    // function previewRedeem(uint256 shares) public view override returns (uint256) {
    //     return convertToAssets(shares);
    // }
    /////////////////////////OLD/////////////////////////////////






    /*///////////////////////////////////////////////////////////////
                            YEARN V2 FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @dev does this cause the last shares to be unretrievable??
    function setMin(uint256 _min) external {
        require(msg.sender == governance, "!governance");
        minFloat = _min;
    }

    function setGovernance(address _governance) public {
        require(msg.sender == governance, "!governance");
        governance = _governance;
    }

    function setController(address _controller) public {
        require(msg.sender == governance, "!governance");
        controller = _controller;
    }

    /// @notice Transfer any available and not limited by cap funds to Controller (=>Strategy).
    function earn() public {
        uint256 _bal = freeFloat();
        asset.transfer(controller, _bal);
        IController(controller).earn(address(asset), _bal);
    }

    function harvest(address reserve, uint256 amount) external {
        require(msg.sender == controller, "!controller");
        require(reserve != address(asset), "token");
        IERC20(reserve).transfer(controller, amount);
    }

    function depositAll() external {
        deposit(asset.balanceOf(msg.sender), msg.sender);
    }

    function withdrawAll() external {
        withdraw(assetsOf(msg.sender), msg.sender, msg.sender);
    }
}
