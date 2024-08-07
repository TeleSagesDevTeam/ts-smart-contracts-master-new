import { ethers, upgrades } from "hardhat";

const PROTOCOL_FEE_DESTINATION = "0xd809767e17362D2909191fdc59237f648185B721";
const PROTOCOL_FEE_AMOUNT = ethers.parseEther("0.05");
const SUBJECT_FEE_AMOUNT = ethers.parseEther("0.05");

async function main() {
  const TeleSagesKeysV1 = await ethers.getContractFactory("TeleSagesKeysV1");
  const telesages = await TeleSagesKeysV1.deploy(
    PROTOCOL_FEE_DESTINATION,
    PROTOCOL_FEE_AMOUNT,
    SUBJECT_FEE_AMOUNT,
  );

  await telesages.waitForDeployment();

  console.log("TeleSagesKeysV1 deployed to:", await telesages.getAddress());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
