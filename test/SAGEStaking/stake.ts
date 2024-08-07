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
    const [owner, fundedAccount, approvedFundedAccount, otherAccount] =
      await ethers.getSigners();

    const MockSage = await ethers.getContractFactory("MockSAGE");
    const sage = await MockSage.deploy();

    const Staking = await ethers.getContractFactory("SAGEStaking");
    const staking = await Staking.deploy(await sage.getAddress());

    await staking.setLockupDurationFactor(
      60 * 60,
      await staking.FACTOR_DENOMINATOR()
    );

    await sage.mint(fundedAccount.address, ethers.parseEther("100000"));
    await sage.mint(approvedFundedAccount.address, ethers.parseEther("100000"));

    await sage
      .connect(approvedFundedAccount)
      .approve(await staking.getAddress(), ethers.parseEther("100000"));

    return {
      owner,
      fundedAccount,
      approvedFundedAccount,
      otherAccount,
      sage,
      staking,
    };
  }

  describe("stake", function () {
    it("Should revert when staking 0 amount", async function () {
      const { staking, approvedFundedAccount } = await loadFixture(
        deployStakingFixture
      );

      await expect(
        staking.connect(approvedFundedAccount).stake(0, 12345678)
      ).to.be.revertedWith("You can't stake 0 SAGE");
    });

    it("Should revert when staking to duration with factor 0", async function () {
      const { staking, approvedFundedAccount } = await loadFixture(
        deployStakingFixture
      );

      await expect(
        staking
          .connect(approvedFundedAccount)
          .stake(ethers.parseEther("1"), 12345)
      ).to.be.revertedWith("Lockup duration not allowed");
    });

    it("Should revert when spending not approved", async function () {
      const { staking, fundedAccount } = await loadFixture(
        deployStakingFixture
      );

      await expect(
        staking.connect(fundedAccount).stake(ethers.parseEther("1"), 60 * 60)
      ).to.be.reverted;
    });

    it("Should transfer funds to newly created escrow on first stake", async function () {
      const { sage, staking, approvedFundedAccount } = await loadFixture(
        deployStakingFixture
      );

      expect(await staking.escrows(approvedFundedAccount.address)).to.eq(
        "0x0000000000000000000000000000000000000000"
      );

      await expect(
        staking
          .connect(approvedFundedAccount)
          .stake(ethers.parseEther("1"), 60 * 60)
      ).and.to.changeTokenBalances(
        sage,
        [approvedFundedAccount],
        [-ethers.parseEther("1")]
      );

      var escrow = await staking.escrows(approvedFundedAccount.address);
      var locks = await staking.getLocks(approvedFundedAccount.address);

      expect(escrow).to.not.eq("0x0000000000000000000000000000000000000000");
      expect(locks.length).to.eq(1);
    });

    it("Should use same lock for multiple stake calls with same duration", async function () {
      const { sage, staking, approvedFundedAccount } = await loadFixture(
        deployStakingFixture
      );

      expect(await staking.escrows(approvedFundedAccount.address)).to.eq(
        "0x0000000000000000000000000000000000000000"
      );

      await expect(
        staking
          .connect(approvedFundedAccount)
          .stake(ethers.parseEther("1"), 60 * 60)
      ).and.to.changeTokenBalances(
        sage,
        [approvedFundedAccount],
        [-ethers.parseEther("1")]
      );

      await expect(
        staking
          .connect(approvedFundedAccount)
          .stake(ethers.parseEther("1"), 60 * 60)
      ).and.to.changeTokenBalances(
        sage,
        [approvedFundedAccount],
        [-ethers.parseEther("1")]
      );

      await expect(
        staking
          .connect(approvedFundedAccount)
          .stake(ethers.parseEther("1"), 60 * 60)
      ).and.to.changeTokenBalances(
        sage,
        [approvedFundedAccount],
        [-ethers.parseEther("1")]
      );

      const escrow = await staking.escrows(approvedFundedAccount.address);
      var locks = await staking.getLocks(approvedFundedAccount.address);

      expect(escrow).to.not.eq("0x0000000000000000000000000000000000000000");
      expect(await sage.balanceOf(escrow)).to.eq(ethers.parseEther("3"));
      expect(locks.length).to.eq(1);
    });
  });
});
