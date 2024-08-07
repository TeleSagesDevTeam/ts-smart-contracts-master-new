import { ethers, upgrades } from "hardhat";

const SHARES_CONTRACT_ADDRESS = "0x87a76c427136b98d98eecb1d7352a5d1094e44ce";
const POOL_INDEX = 0;

async function main() {
  const telesages = await ethers.getContractAt(
    "Telesages",
    SHARES_CONTRACT_ADDRESS
  );

  await telesages.createPool(POOL_INDEX, 0, 0, 500);

  console.log(`Created poolIndex ${POOL_INDEX}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
