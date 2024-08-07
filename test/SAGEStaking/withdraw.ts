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
    const [owner, rewarder, stakerAccount66, stakerAccount33, otherAccount] =
      await ethers.getSigners();

    const MockSage = await ethers.getContractFactory("MockSAGE");
    const sage = await MockSage.deploy();

    const Staking = await ethers.getContractFactory("SAGEStaking");
    const staking = await Staking.deploy(await sage.getAddress());

    await staking.setLockupDurationFactor(
      60 * 60,
      await staking.FACTOR_DENOMINATOR()
    );

    await staking.grantRole(await staking.REWARDER_ROLE(), rewarder.address);

    await sage.mint(owner.address, ethers.parseEther("100000"));
    await sage.mint(rewarder.address, ethers.parseEther("100000"));
    await sage.mint(stakerAccount66.address, ethers.parseEther("100000"));
    await sage.mint(stakerAccount33.address, ethers.parseEther("100000"));

    await sage.approve(await staking.getAddress(), ethers.parseEther("100000"));
    await sage
      .connect(rewarder)
      .approve(await staking.getAddress(), ethers.parseEther("100000"));
    await sage
      .connect(stakerAccount66)
      .approve(await staking.getAddress(), ethers.parseEther("100000"));
    await sage
      .connect(stakerAccount33)
      .approve(await staking.getAddress(), ethers.parseEther("100000"));

    await staking
      .connect(stakerAccount66)
      .stake(ethers.parseEther("66"), 60 * 60);
    await staking
      .connect(stakerAccount33)
      .stake(ethers.parseEther("33"), 60 * 60);

    return {
      owner,
      rewarder,
      stakerAccount33,
      stakerAccount66,
      otherAccount,
      sage,
      staking,
    };
  }

  describe("withdraw", function () {
    it("Should revert when withdrawing an empty lock", async function () {
      const { staking, otherAccount } = await loadFixture(deployStakingFixture);

      await expect(
        staking.connect(otherAccount).withdraw(60 * 60)
      ).to.be.revertedWith("Nothing staked here");
    });

    it("Should revert when withdrawing a lock that's not unstaking", async function () {
      const { staking, stakerAccount33 } = await loadFixture(
        deployStakingFixture
      );

      await expect(
        staking.connect(stakerAccount33).withdraw(60 * 60)
      ).to.be.revertedWith("Not unstaking");
    });

    it("Should revert when withdrawing a lock that's still unstaking", async function () {
      const { staking, stakerAccount33 } = await loadFixture(
        deployStakingFixture
      );

      await staking.connect(stakerAccount33).unstake(60 * 60);

      await expect(
        staking.connect(stakerAccount33).withdraw(60 * 60)
      ).to.be.revertedWith("Unstaking incomplete");
    });

    it("Should revert when withdrawing just before completion", async function () {
      const { staking, stakerAccount33 } = await loadFixture(
        deployStakingFixture
      );

      await staking.connect(stakerAccount33).unstake(60 * 60);

      await time.increase(60 * 59);

      await expect(
        staking.connect(stakerAccount33).withdraw(60 * 60)
      ).to.be.revertedWith("Unstaking incomplete");
    });

    it("Should revert when withdrawing twice", async function () {
      const { sage, staking, stakerAccount33 } = await loadFixture(
        deployStakingFixture
      );

      await staking.connect(stakerAccount33).unstake(60 * 60);

      await time.increase(60 * 60);

      await staking.connect(stakerAccount33).withdraw(60 * 60);
      await expect(
        staking.connect(stakerAccount33).withdraw(60 * 60)
      ).to.be.revertedWith("Nothing staked here");
    });

    it("Should transfer funds from escrow to staker", async function () {
      const { sage, staking, stakerAccount33 } = await loadFixture(
        deployStakingFixture
      );

      const escrow = await staking.escrows(stakerAccount33.address);

      await staking.connect(stakerAccount33).unstake(60 * 60);

      await time.increase(60 * 60);

      await expect(
        staking.connect(stakerAccount33).withdraw(60 * 60)
      ).to.changeTokenBalances(
        sage,
        [escrow, stakerAccount33.address],
        [-ethers.parseEther("33"), ethers.parseEther("33")]
      );
    });
  });
});
