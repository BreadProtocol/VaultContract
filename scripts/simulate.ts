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

  // Get Dai for testing
  const richDaiOwner = await ethers.getSigner("0x075e72a5edf65f0a5f44699c7654c1a76941ddc8");
  DAIContract = new Contract(DAI_ADDRESS, DAI_ABI, richDaiOwner);

  await transferDaiToSigners();

  // TRANSFER Dai to single user for Vault deposit
  async function transferDaiToSigners() {
    console.log("\n\n////////////////////////WELCOME////////////////////////////////")
    console.log("````````````````````````````````````````````````````````````````")
    console.log("Welcome to BREAD PROTOCOL! Let's fight inflation together!");
    console.log(",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,")
    console.log("////////////////////////WELCOME/////////////////////////////////")

    const toMint = ethers.utils.parseEther("110000");
    await DAIContract.transfer(signers[0].address, toMint);
    console.log("\n\n/////////////////////////USER/////////////////////////////////")
    console.log("``````````````````````````````````````````````````````````````")
    console.log(signers[0].address);
    console.log(",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,")
    console.log("/////////////////////////USER/////////////////////////////////")
    console.log(" ")
  }

  
  await deployController();
  await deployVault();
  await deployAndSetStrategy();
  await initializeMocks();
  await depositSomeUnderlyingToVault();
  await callEarnOnVault();
  await callHarvestFromStrat();


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

  async function initializeMocks() {
    vaultContract.setMocks(1140, 350);
  }

  async function deployAndSetStrategy() {
    const strategyFactory = new StrategyDAICompoundBasic__factory(deployer);
    strategyContract = await strategyFactory.deploy(controllerContract.address);
    await controllerContract.setVault(DAI_ADDRESS, vaultContract.address);
    await controllerContract.approveStrategy(DAI_ADDRESS, strategyContract.address);
    console.log("\n/////////////////////////STRATEGY ADDRESS/////////////////////////////////")
    console.log("``````````````````````````````````````````````````````````````````````````")
    console.log("Strategy Contract Address is:");
    console.log(strategyContract.address);
    console.log(",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,")
    console.log("/////////////////////////STRATEGY ADDRESS/////////////////////////////////")
    console.log(" ")
    await controllerContract.setStrategy(DAI_ADDRESS, strategyContract.address);
  }

  async function depositSomeUnderlyingToVault() {
    console.log("\n/////////////////////////DEPOSIT SETUP/////////////////////////////////")
    console.log("```````````````````````````````````````````````````````````````````````")
    // USER decides to deposit 10,000 Dai
    const depositAmount = ethers.utils.parseEther("10000");
    // USER wants to mint 1894 ISUSD tokens in return
    const sharesDesired = ethers.utils.parseEther("1894");
    
    // Set up and approve
    const instanceERC = DAIContract.connect(signers[0]);
    const instanceVAULT = vaultContract.connect(signers[0]);
    await instanceERC.approve(vaultContract.address, depositAmount);
    await vaultContract.collateralCheck(depositAmount, sharesDesired);
    const toDecimals = 10000;
    console.log("You want this many shares: ", ethers.utils.formatUnits(sharesDesired.toString()));
    console.log("You want to deposit this much Dai: ", ethers.utils.formatUnits(depositAmount.toString()));

    const inflationRate = 1140;
    const yieldRate = 350;
    await vaultContract.setMocks(inflationRate, yieldRate);
    console.log("Truflation is at: ", inflationRate);
    console.log("Yield is at: ", yieldRate);
    const minimumCollateralTest = await vaultContract.minimumCollateral() / toDecimals;
    console.log("\nSo the Minimum Collateral Rate is: ", minimumCollateralTest.toString());

    const previewCollateralRatePreview = await vaultContract.previewCollateralRate(depositAmount, sharesDesired) / toDecimals;
    console.log("Your Collateral Rate:", previewCollateralRatePreview.toString());
    await instanceVAULT.deposit(depositAmount, signers[0].address);
    console.log("\nDepositing...");
    console.log("\nDeposit Successful!");
    console.log(",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,")
    console.log("/////////////////////////DEPOSIT SETUP/////////////////////////////////")
    console.log(" ")

    console.log("Your funds have been placed into your vault!")
    console.log("User and vault balance sheets follow: ")

    await checkSingleBalance(deployer, vaultContract);
    await vaultBalanceSheet(vaultContract, strategyContract);
  }

  async function callEarnOnVault() {
    console.log("\nLet's get those funds invested to beat inflation!");
    console.log("Moving funds to inflation hedge investment strategy...");
    await vaultContract.earn();
    console.log("\n\nSuccess!");
    const userTotalShares = await vaultContract.maxRedeem(deployer.address);
    console.log("\n\nYou're now the proud owner of ", ethers.utils.formatUnits(userTotalShares.toString()), "inflation resistant tokens!");
    console.log("``````````````````````````````````````````````````````````````````````````````");
    console.log("\n\nLet's pass some time and earn that sweet yield...");
    await mineBlocks();
    console.log("\nSuccess! Blocks have been mined!");
    console.log("\n\nLet's harvest our earnings and check our yield...");
  }

  async function callHarvestFromStrat() {
    const instanceVAULT = vaultContract.connect(signers[0]);
    await strategyContract.harvest();
    await checkSingleBalance(deployer, vaultContract);
    await vaultBalanceSheet(vaultContract, strategyContract);
    console.log("\n\nAwesome! Take that inflation!");
    console.log("\n\nLooks like Truflation and Yield have changed...");
    const inflationRate = 1553;
    const yieldRate = 315;
    await vaultContract.setMocks(inflationRate, yieldRate);
    console.log("Truflation is at: ", inflationRate);
    console.log("Yield is at: ", yieldRate);
    console.log("\n\nSince they've increased, we want to increase our collateral too!");
    const toDecimals = 10000;
    const minimumCollateralTest = await vaultContract.minimumCollateral() / toDecimals;
    console.log("\nSo the Minimum Collateral Rate is now: ", minimumCollateralTest.toString());
    const justTheRate = await vaultContract.returnCollateralRatePreview() / toDecimals;
    console.log("\nYour collateral rate is: ", justTheRate.toString());
    console.log("That's closer than we'd like, so let's make a deposit to increase our collateral...");
    const instanceERC = DAIContract.connect(signers[0]);
    const depositAmount = ethers.utils.parseEther("1000");
    await instanceERC.approve(vaultContract.address, depositAmount);
    await instanceVAULT.justDeposit(depositAmount, signers[0].address);
    console.log("\nYou deposited: ", ethers.utils.formatUnits(depositAmount.toString()));
    const newCollateralRate = await vaultContract.previewCollateralRate(0,0) / toDecimals;
    console.log("\n\nYour collateral rate is now: ", newCollateralRate.toString());
    console.log("\n\nWay to go! Building off of this variable collateralization, we can beat inflation!");
    console.log("``````````````````````````````````````````````````````````````````````````````````\n\n\n");
  }

}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
