import { ethers, upgrades } from "hardhat";

const SHARES_CONTRACT_ADDRESS = "0x87a76c427136b98d98eecb1d7352a5d1094e44ce";
const SUBJECT_ADDRESS = "0xca7FC0c5051a4BF417fc397b871B41E6051aE0B5";
const POOL_INDEX = 0;

async function main() {
  const telesages = await ethers.getContractAt(
    "Telesages",
    SHARES_CONTRACT_ADDRESS
  );

  const price = await telesages.getBuyPriceAfterFee(
    SUBJECT_ADDRESS,
    POOL_INDEX,
    1
  );

  await telesages.buyKeys(SUBJECT_ADDRESS, POOL_INDEX, 1, {
    value: price,
  });

  console.log("Purchased 1 share");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
