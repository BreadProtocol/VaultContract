import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/dist/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const deployStrategyDAICompoundBasic: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getNamedAccounts, deployments, network } = hre;
  const { deployer } = await getNamedAccounts();
  const { deploy, log, get } = deployments;

  const controller = await get("Controller");
  const vault = await get("Vault");

  log("Deploying StrategyDAICompoundBasic...");
  const strategy = await deploy("StrategyDAICompoundBasic", {
    from: deployer,
    args: [controller.address],
    log: true,
  });

  log(`03 - Deployed 'StrategyDAICompoundBasic' at ${strategy.address}`);

  log("Setting up Strategy...");
  await setUpStrategy(controller.address, vault.address, strategy.address);
  log("03 - StrategyDAICompoundBasic set");
};

export default deployStrategyDAICompoundBasic;
deployStrategyDAICompoundBasic.tags = ["all", "strategy"];

const setUpStrategy = async (controllerAddress: string, vaultAddress: string, strategyAddress: string) => {
  // set vault
  const DAI_ADDRESS = "0x6b175474e89094c44da98b954eedeac495271d0f";
  const controller = await ethers.getContractAt("Controller", controllerAddress);
  const txResponse = await controller.setVault(DAI_ADDRESS, vaultAddress);
  await txResponse.wait(1);
  // approve strategy
  const txResponse1 = await controller.approveStrategy(DAI_ADDRESS, strategyAddress);
  await txResponse1.wait(1);
  // set strategy
  const txResponse2 = await controller.setStrategy(DAI_ADDRESS, strategyAddress);
  await txResponse2.wait(1);
};
