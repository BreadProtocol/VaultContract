import { ethers } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { Controller__factory, StrategyDAICompoundBasic__factory, Vault__factory } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { DAI_ABI } from "./abi/DAI";
import { checkUserBalances, checkSingleBalance, vaultBalanceSheet, mineBlocks } from "./helpers/helpers";

import hre from "hardhat";
import { boolean } from "hardhat/internal/core/params/argumentTypes";

const DAI_ADDRESS = "0x6b175474e89094c44da98b954eedeac495271d0f";
const truflationMock = 11.4;

async function main(): Promise<void> {
  let signers: SignerWithAddress[];
  let DAIContract: Contract;
  let controllerContract: Contract;
  let vaultContract: Contract;
  let strategyContract: Contract;

  const [deployer] = await ethers.getSigners();
  signers = await ethers.getSigners();

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: ["0x075e72a5edf65f0a5f44699c7654c1a76941ddc8"], // 200 mln dai
  });

  const richDaiOwner = await ethers.getSigner("0x075e72a5edf65f0a5f44699c7654c1a76941ddc8");
  DAIContract = new Contract(DAI_ADDRESS, DAI_ABI, richDaiOwner);

  await transferDaiToSigners();

  // CONVERTED to single user
  async function transferDaiToSigners() {
    const toMint = ethers.utils.parseEther("110000");
    await DAIContract.transfer(signers[0].address, toMint);
    console.log("/////////////////////////USER/////////////////////////////////")
    console.log(signers[0].address);
    console.log("/////////////////////////USER/////////////////////////////////")
  }
  
  /////////////////////////OLD/////////////////////////////////
  // async function transferDaiToSigners() {
  //   const toMint = ethers.utils.parseEther("110000");
  //   for (let i = 0; i < signers.length; i++) {
  //     await DAIContract.transfer(signers[i].address, toMint);
  //   }
  // }
  /////////////////////////OLD/////////////////////////////////

  await deployController();
  await deployVault();
  await deployAndSetStrategy();
  await depositSomeUnderlyingToVault();
  await callEarnOnVault();
  await callHarvestFromStrat();
  await redeemShares();

  async function deployController() {
    const controllerFactory = new Controller__factory(deployer);
    // rewards accumulated in Vault (set rewards later)
    // controllerContract = await controllerFactory.deploy(deployer.address);
    controllerContract = await controllerFactory.deploy("0x0000000000000000000000000000000000000000");
  }

  async function deployVault() {
    const vaultFactory = new Vault__factory(deployer);
    vaultContract = await vaultFactory.deploy(
      DAI_ADDRESS,
      "DaiVault",
      "yDAI",
      deployer.address,
      controllerContract.address,
    );
  }

  async function deployAndSetStrategy() {
    const strategyFactory = new StrategyDAICompoundBasic__factory(deployer);
    strategyContract = await strategyFactory.deploy(controllerContract.address);
    await controllerContract.setVault(DAI_ADDRESS, vaultContract.address);
    await controllerContract.approveStrategy(DAI_ADDRESS, strategyContract.address);
    await controllerContract.setStrategy(DAI_ADDRESS, strategyContract.address);
  }

  async function depositSomeUnderlyingToVault() {
    const depositAmount = ethers.utils.parseEther("10000");
    const sharesDesired = ethers.utils.parseEther("1894");
    const instanceERC = DAIContract.connect(signers[0]);
    const instanceVAULT = vaultContract.connect(signers[0]);
    await instanceERC.approve(vaultContract.address, depositAmount);
    await vaultContract.collateralCheck(depositAmount, sharesDesired);

    const testRate = await vaultContract.previewCollateralRate(9999,1618);
    console.log("TEST", ethers.utils.formatUnits(testRate.toString()));

    const minimumCollateralTest = await vaultContract.minimumCollateral();
    console.log("XMinimum Collateral Rate is", minimumCollateralTest.toString());

    const previewCollateralRatePreview = await vaultContract.previewCollateralRate(depositAmount, sharesDesired);
    console.log("XpreviewCollateralRatePreview...", previewCollateralRatePreview.toString());

    console.log("XUser wants this many shares", ethers.utils.formatUnits(sharesDesired.toString()));
    console.log("XUser wants to deposit this much DAI", ethers.utils.formatUnits(depositAmount.toString()));

    const justTheRate = await vaultContract.returnCollateralRatePreview();
    console.log("Just grabbing the rate...", justTheRate.toString());

    const previewSharesAmountTest = await vaultContract.convertToShares(depositAmount);
    console.log("XconvertToShares() test", ethers.utils.formatUnits(previewSharesAmountTest.toString()));

    console.log("Just grabbing the rate...", justTheRate.toString());

    await instanceVAULT.deposit(depositAmount, signers[0].address);
    console.log("XUser has attempted to deposit", ethers.utils.formatUnits(depositAmount.toString()));

    console.log("Just grabbing the rate...", justTheRate.toString());

    const userAssets = await vaultContract.assetsOf(signers[0].address);
    console.log("XUser's Actual Assets", ethers.utils.formatUnits(userAssets.toString()));

    const previewSharesAmountTest2 = await vaultContract.convertToShares(userAssets);
    console.log("XconvertToShares from actual assets", ethers.utils.formatUnits(previewSharesAmountTest2.toString()));

    const initPricePerShare = await vaultContract.assetsPerShare();
    console.log("Collateral Per Share:", ethers.utils.formatUnits(initPricePerShare.toString()));

    await checkSingleBalance(deployer, vaultContract);
    await vaultBalanceSheet(vaultContract, strategyContract);
  }

  /////////////////////////OLD/////////////////////////////////
  // async function depositSomeUnderlyingToVault() {
  //   const depositAmount = ethers.utils.parseEther("10000");
  //   for (let i = 0; i < signers.length; i++) {
  //     const instanceERC = DAIContract.connect(signers[i]);
  //     const instanceVAULT = vaultContract.connect(signers[i]);
  //     await instanceERC.approve(vaultContract.address, depositAmount);
  //     await instanceVAULT.deposit(depositAmount, signers[i].address);
  //     console.log("User has deposited", depositAmount.toString());
  //   }
  //   await checkUserBalances(signers, vaultContract);
  //   await vaultBalanceSheet(vaultContract, strategyContract);
  // }
  /////////////////////////OLD/////////////////////////////////


  async function callEarnOnVault() {
    await vaultContract.earn();
    await mineBlocks();
    await checkSingleBalance(deployer, vaultContract);
  }

  async function callHarvestFromStrat() {
    await strategyContract.harvest();
    await vaultBalanceSheet(vaultContract, strategyContract);
  }

  async function redeemShares() {
    const pricePerShare = await vaultContract.assetsPerShare();
    console.log("Collateral Per Share:", ethers.utils.formatUnits(pricePerShare.toString()));
    const minimumCollateral = await vaultContract.minimumCollateral();
    console.log("Minimum Collateral:", ethers.utils.formatUnits(minimumCollateral.toString()));
    // balanceOf is called as a method of vaultcontract.
    // I believe vaultContract.balanceOf(deployer.address)
    // gets the balance of share tokens for the user with the account at deployer.address
    // it gets the users share tokens (tokens because it is ERC4626 which inherits ERC20)
    const userShareTokenBalance = await vaultContract.balanceOf(deployer.address);
    console.log("userSharetoken", ethers.utils.formatUnits(userShareTokenBalance.toString()));
    // from my understanding of redeem (redeeming shares for equivalent underlying assets),
    // previewrRedeem does the same thing as redeem, but does not change the state of the blochain.
    // it's kind of like a 'safety check' to make sure you can actually redeem the input shares
    const userEarningsOnShare: BigNumber = await vaultContract.previewRedeem(userShareTokenBalance);
    console.log("userEarningsOnShare", ethers.utils.formatUnits(userEarningsOnShare.toString()));
    // this is where you actually redeem shares using redeem(amount, to, from)
    // in this instance, to and from are the same (deployer.address)
    // so this user is redeeming their shares and sending the assets to their account
    // the user can also send the assets redeemed to another user's account (a friend, or anyone)
    
    const maxWithdrawTest = await vaultContract.maxWithdraw(deployer.address);
    console.log("max withdraw", maxWithdrawTest.toString());

    const maxRedeemTest = await vaultContract.maxRedeem(deployer.address);
    console.log("max redeem", maxRedeemTest.toString());

    // console.log("Withdrawing...")
    // await vaultContract.withdraw(10002, deployer.address, deployer.address);
    // await vaultContract.withdrawEverything(deployer.address, deployer.address);

    
    
    
    console.log("Redeeming...")
    // const halfTokens = 199999;
    // await vaultContract.redeem(halfTokens, deployer.address, deployer.address); // amount, to, from
    // await vaultContract.redeem(userShareTokenBalance, deployer.address, deployer.address); // amount, to, from

    await vaultContract.withdraw(9995, deployer.address, deployer.address);

    await checkSingleBalance(deployer, vaultContract);
    await vaultBalanceSheet(vaultContract, strategyContract);
    console.log("Successfully Redeemed!")
    console.log("Collateral Per Share:", ethers.utils.formatUnits(pricePerShare.toString()));
    console.log("userSharetoken", ethers.utils.formatUnits(userShareTokenBalance.toString()));
    await checkSingleBalance(deployer, vaultContract);
    await vaultBalanceSheet(vaultContract, strategyContract);
    const userTotalAssets = await vaultContract.maxWithdraw(deployer.address);
    console.log("userTotalAssets", ethers.utils.formatUnits(userTotalAssets.toString()));
    const userTotalShares = await vaultContract.maxRedeem(deployer.address);
    console.log("userTotalShares", ethers.utils.formatUnits(userTotalShares.toString()));
    const totalUnderlyingInVault = await vaultContract.totalAssets();
    console.log("total Underlying in Vault", ethers.utils.formatUnits(totalUnderlyingInVault.toString()));
    console.log("Collateral Per Share:", ethers.utils.formatUnits(pricePerShare.toString()));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
