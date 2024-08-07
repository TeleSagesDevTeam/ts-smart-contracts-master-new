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

  describe("addReward", function () {
    it("Should require REWARDER role", async function () {
      const { sage, staking, otherAccount } = await loadFixture(
        deployStakingFixture
      );

      expect(
        await staking.hasRole(
          await staking.REWARDER_ROLE(),
          otherAccount.address
        )
      ).to.be.false;

      await expect(
        staking
          .connect(otherAccount)
          .addReward(await sage.getAddress(), ethers.parseEther("1"), 0)
      ).to.reverted;
    });

    it("Should revert when adding 0 amount", async function () {
      const { sage, rewarder, staking } = await loadFixture(
        deployStakingFixture
      );

      await expect(
        staking.connect(rewarder).addReward(await sage.getAddress(), 0, 0)
      ).to.revertedWith("Cant add 0 reward");
    });

    describe("Duration 0", function () {
      it("Should increase totalRewardPerShare according to total stake", async function () {
        const { sage, staking, rewarder } = await loadFixture(
          deployStakingFixture
        );

        await staking
          .connect(rewarder)
          .addReward(await sage.getAddress(), ethers.parseEther("1"), 0);

        const totalShares = await staking.getTotalRewardShares();

        expect(
          await staking.totalRewardPerShare(await sage.getAddress())
        ).to.eq((10n ** 19n * ethers.parseEther("1")) / totalShares);

        await staking
          .connect(rewarder)
          .addReward(await sage.getAddress(), ethers.parseEther("4"), 0);

        expect(
          await staking.totalRewardPerShare(await sage.getAddress())
        ).to.eq((10n ** 19n * ethers.parseEther("5")) / totalShares);
      });
    });
  });

  describe("addRewardETH (duration 0)", function () {
    it("Should require REWARDER role", async function () {
      const { staking, otherAccount } = await loadFixture(deployStakingFixture);

      expect(
        await staking.hasRole(
          await staking.REWARDER_ROLE(),
          otherAccount.address
        )
      ).to.be.false;

      await expect(
        staking
          .connect(otherAccount)
          .addRewardETH(0, { value: ethers.parseEther("1") })
      ).to.reverted;
    });

    it("Should revert when adding 0 amount", async function () {
      const { staking, rewarder } = await loadFixture(deployStakingFixture);

      await expect(
        staking.connect(rewarder).addRewardETH(0, { value: 0 })
      ).to.revertedWith("Cant add 0 reward");
    });

    describe("Duration 0", function () {
      it("Should increase totalRewardPerShare according to total stake", async function () {
        const { staking, rewarder } = await loadFixture(deployStakingFixture);

        await staking
          .connect(rewarder)
          .addRewardETH(0, { value: ethers.parseEther("1") });

        const totalShares = await staking.getTotalRewardShares();

        expect(
          await staking.totalRewardPerShare(
            "0x0000000000000000000000000000000000000000"
          )
        ).to.eq((10n ** 19n * ethers.parseEther("1")) / totalShares);

        await staking
          .connect(rewarder)
          .addRewardETH(0, { value: ethers.parseEther("4") });

        expect(
          await staking.totalRewardPerShare(
            "0x0000000000000000000000000000000000000000"
          )
        ).to.eq((10n ** 19n * ethers.parseEther("5")) / totalShares);
      });
    });
    describe("Streaming", function () {
      it("Should not touch totalRewardPerShare before time passes", async function () {
        const { staking, rewarder } = await loadFixture(deployStakingFixture);

        await staking
          .connect(rewarder)
          .addRewardETH(3600, { value: ethers.parseEther("1") });

        expect(
          await staking.totalRewardPerShare(
            "0x0000000000000000000000000000000000000000"
          )
        ).to.eq(0);
      });

      it("Should increase totalRewardPerShare by half amount after half duration", async function () {
        const { staking, rewarder } = await loadFixture(deployStakingFixture);

        const totalShares = await staking.getTotalRewardShares();

        await staking
          .connect(rewarder)
          .addRewardETH(3600, { value: ethers.parseEther("1") });

        await time.increase(1799);

        await staking.distributeStreamingRewards();

        expect(
          await staking.totalRewardPerShare(
            "0x0000000000000000000000000000000000000000"
          )
        )
          .to.lessThanOrEqual(
            (10n ** 19n * ethers.parseEther("1")) / totalShares / 2n
          )
          .and.to.be.greaterThanOrEqual(
            (10n ** 19n * ethers.parseEther("1")) / totalShares / 3n
          );
      });
      it("Should increase totalRewardPerShare by full amount after full duration", async function () {
        const { staking, rewarder } = await loadFixture(deployStakingFixture);

        const totalShares = await staking.getTotalRewardShares();

        await staking
          .connect(rewarder)
          .addRewardETH(3600, { value: ethers.parseEther("1") });

        await time.increase(3600);

        await staking.distributeStreamingRewards();

        expect(
          await staking.totalRewardPerShare(
            "0x0000000000000000000000000000000000000000"
          )
        ).to.eq((10n ** 19n * ethers.parseEther("1")) / totalShares);
      });
      it("Should delete StreamingReward after duration", async function () {
        const { staking, rewarder } = await loadFixture(deployStakingFixture);

        await staking
          .connect(rewarder)
          .addRewardETH(3600, { value: ethers.parseEther("1") });

        expect((await staking.streamingRewards(0)).duration).to.eq(3600);
        expect((await staking.streamingRewards(0)).distributedAmount).to.eq(0);
        expect((await staking.streamingRewards(0)).amount).to.eq(
          ethers.parseEther("1")
        );

        await time.increase(3600);

        await staking.distributeStreamingRewards();

        await expect(staking.streamingRewards(0)).to.be.revertedWithoutReason;
      });
    });
  });
});
