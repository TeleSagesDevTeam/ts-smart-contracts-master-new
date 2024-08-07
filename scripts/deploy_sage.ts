import { ethers } from "hardhat";

async function main() {
  const MockSAGE = await ethers.getContractFactory("MockSAGE");
  const mockSage = await MockSAGE.deploy();

  await mockSage.waitForDeployment();

  console.log("SAGE deployed to:", await mockSage.getAddress());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
