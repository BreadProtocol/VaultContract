import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/dist/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const deployController: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const TREASURY_Y_CHAD_ETH_YEARN_REWARDS = "0xfeb4acf3df3cdea7399794d0869ef76a6efaff52";
  const { getNamedAccounts, deployments, network } = hre;
  const { deployer } = await getNamedAccounts();
  const { deploy, log } = deployments;

  log("Deploying Controller...");
  const controller = await deploy("Controller", {
    from: deployer,
    args: [TREASURY_Y_CHAD_ETH_YEARN_REWARDS],
    log: true,
  });

  log(`01 - Deployed 'Controller' at ${controller.address}`);
};

export default deployController;
deployController.tags = ["all", "controller"];
