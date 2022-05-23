import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/dist/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const deployVault: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getNamedAccounts, deployments, network } = hre;
  const { deployer } = await getNamedAccounts();
  const { deploy, log, get } = deployments;

  const DAI_ADDRESS = "0x6b175474e89094c44da98b954eedeac495271d0f";
  const controller = await get("Controller");

  log("Deploying Vault...");
  const vault = await deploy("Vault", {
    from: deployer,
    args: [DAI_ADDRESS, "Inflation Stable USD Coin", "ISUSD", deployer, controller.address],
    log: true,
  });

  log(`02 - Deployed 'Vault' at ${vault.address}`);
};

export default deployVault;
deployVault.tags = ["all", "vault"];
