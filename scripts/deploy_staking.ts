import { ethers } from "hardhat";

const SAGE_ADDRESS = "";

async function main() {
  const SAGEStaking = await ethers.getContractFactory("SAGEStaking");

  const sageStaking = await SAGEStaking.deploy(SAGE_ADDRESS);
  await sageStaking.waitForDeployment();

  console.log("SAGEStaking deployed to:", await sageStaking.getAddress());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
