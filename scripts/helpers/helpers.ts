import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

export async function checkUserBalances(signers: SignerWithAddress[], vaultContract: Contract) {
    // for (let i = 0; i <= signers.slice(0, 3).length; i++) {
      const vaultInstance = vaultContract.connect(signers[0]);
      const userUnderlyingInVault = await vaultInstance.assetsOf(signers[0].address);
      // below was changed from previewRedeem() to previewWithdraw(), 
      // redeem is for shares, and withdraw is for assets
      const userSharesFromUnderlying = await vaultInstance.previewWithdraw(userUnderlyingInVault);
      const totalUnderlyingInVault = await vaultInstance.totalAssets();
      const availableInVaultOutsideStrat = await vaultInstance.freeFloat();
      const result =
      "totalAssets()" +
      ethers.utils.formatUnits(totalUnderlyingInVault) +
      " freeFloat(): " +
      ethers.utils.formatUnits(availableInVaultOutsideStrat) +
        " user underlyingInVault: " +
        ethers.utils.formatUnits(userUnderlyingInVault.toString()) +
        " user sharesFromUnderlying: " +
        ethers.utils.formatUnits(userSharesFromUnderlying.toString());
      console.log(result);
// }
  }

export async function checkSingleBalance(signer: SignerWithAddress, vaultContract: Contract) {
      const vaultInstance = vaultContract.connect(signer);
      // NOTE: assetsOf() is the same as previewRedeem and dependent on collateral rate
      const userUnderlyingInVault = await vaultInstance.assetsOf(signer.address);
      // below was changed from previewRedeem() to previewWithdraw(), 
      // redeem is for shares, and withdraw is for assets
      const userSharesFromUnderlying = await vaultInstance.previewWithdraw(userUnderlyingInVault);
      const totalUnderlyingInVault = await vaultInstance.totalAssets();
      const availableInVaultOutsideStrat = await vaultInstance.freeFloat();
      const result =
        "totalAssets()" +
        ethers.utils.formatUnits(totalUnderlyingInVault) +
        "\nfreeFloat(): " +
        ethers.utils.formatUnits(availableInVaultOutsideStrat) +
        "\nuser underlyingInVault: " +
        ethers.utils.formatUnits(userUnderlyingInVault.toString()) +
        "\nuser sharesFromUnderlying: " +
        ethers.utils.formatUnits(userSharesFromUnderlying.toString());
      console.log("\n\n/////////////////////////////////////USER BALANCE SHEET/////////////////////////////////////////////")
      console.log("````````````````````````````````````````````````````````````````````````````````````````````````````")
      console.log(result);
      console.log(",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,")
      console.log("/////////////////////////////////////USER BALANCE SHEET/////////////////////////////////////////////")
    
  }

export async function vaultBalanceSheet(vaultContract: Contract, strategyContract: Contract) {
    console.log("\n\n/////////////////////////////////////VAULT BALANCE SHEET/////////////////////////////////////////////")
    console.log("`````````````````````````````````````````````````````````````````````````````````````````````````````")
    const balance = await vaultContract.totalAssets();
    console.log("totalAssets():", ethers.utils.formatUnits(balance.toString()))

    const availableInVaultOutsideStrat = await vaultContract.idleFloat();
    console.log("idleFloat():", ethers.utils.formatUnits(availableInVaultOutsideStrat.toString()))

    const availableToDepositIntoStrategy = await vaultContract.freeFloat();
    console.log("freeFloat():", ethers.utils.formatUnits(availableToDepositIntoStrategy.toString()))

    const balanceOf = await strategyContract.balanceOf()
    console.log("strategy balanceOf:", ethers.utils.formatUnits(balanceOf.toString()));

    const balanceC = await strategyContract.balanceC()
    console.log("strategy balanceC:", ethers.utils.formatUnits(balanceC.toString()));

    const balanceCInToken = await strategyContract.balanceCInToken()
    console.log("strategy balanceCInToken:", ethers.utils.formatUnits(balanceCInToken.toString()));
    console.log(",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,")
    console.log("/////////////////////////////////////VAULT BALANCE SHEET/////////////////////////////////////////////")
  }

export async function mineBlocks() {
    console.log("\n\n////////////////////////MINING////////////////////////////////")
    console.log("``````````````````````````````````````````````````````````````")
    for (let index = 0; index < 10; index++) {
      console.log("mining block", index);
      await ethers.provider.send("evm_mine", []);
    }
    console.log(",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,")
    console.log("////////////////////////MINING////////////////////////////////")
    console.log(" ")
  }