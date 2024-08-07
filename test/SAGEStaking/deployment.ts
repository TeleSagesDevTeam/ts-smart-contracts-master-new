import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("SAGEStaking", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployStakingFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners();

    const MockSage = await ethers.getContractFactory("MockSAGE");
    const sage = await MockSage.deploy();

    const Staking = await ethers.getContractFactory("SAGEStaking");
    const staking = await Staking.deploy(await sage.getAddress());

    await sage.mint(owner.address, ethers.parseEther("100000"));

    return {
      owner,
      otherAccount,
      sage,
      staking,
    };
  }

  describe("deployment", function () {
    it("Should give deployer all roles", async function () {
      const { staking, owner } = await loadFixture(deployStakingFixture);

      const ADMIN_ROLE = await staking.DEFAULT_ADMIN_ROLE();
      const REWARDER_ROLE = await staking.REWARDER_ROLE();
      const LOCKUP_MANAGER_ROLE = await staking.LOCKUP_MANAGE_ROLE();

      expect(await staking.hasRole(ADMIN_ROLE, owner.address)).to.be.true;
      expect(await staking.hasRole(REWARDER_ROLE, owner.address)).to.be.true;
      expect(await staking.hasRole(LOCKUP_MANAGER_ROLE, owner.address)).to.be
        .true;
    });

    it("Should not give other account any roles", async function () {
      const { staking, otherAccount } = await loadFixture(deployStakingFixture);

      const ADMIN_ROLE = await staking.DEFAULT_ADMIN_ROLE();
      const REWARDER_ROLE = await staking.REWARDER_ROLE();
      const LOCKUP_MANAGER_ROLE = await staking.LOCKUP_MANAGE_ROLE();

      expect(await staking.hasRole(ADMIN_ROLE, otherAccount.address)).to.be
        .false;
      expect(await staking.hasRole(REWARDER_ROLE, otherAccount.address)).to.be
        .false;
      expect(await staking.hasRole(LOCKUP_MANAGER_ROLE, otherAccount.address))
        .to.be.false;
    });
  });
});
