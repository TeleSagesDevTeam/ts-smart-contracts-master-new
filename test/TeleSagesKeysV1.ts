import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Telesages", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployPoolFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, protocolFeeDestination, otherAccount] =
      await ethers.getSigners();

    const Telesages = await ethers.getContractFactory("TeleSagesKeysV1");
    const protocolFee = ethers.parseEther("0.05");
    const subjectFee = ethers.parseEther("0.05");

    const telesages = await Telesages.deploy(
      owner.address,
      protocolFeeDestination.address,
      protocolFee,
      subjectFee
    );

    return {
      telesages,
      owner,
      protocolFeeDestination,
      otherAccount,
      protocolFee,
      subjectFee,
    };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { telesages, owner } = await loadFixture(deployPoolFixture);

      expect(await telesages.owner()).to.equal(owner.address);
    });

    it("Should set the right protocolFeeDestination", async function () {
      const { telesages: telesages, protocolFeeDestination } =
        await loadFixture(deployPoolFixture);

      expect(await telesages.protocolFeeDestination()).to.equal(
        protocolFeeDestination.address
      );
    });

    it("Should set the right protocol fee percent", async function () {
      const { telesages: telesages, protocolFee } = await loadFixture(
        deployPoolFixture
      );

      expect(await telesages.protocolFeePercent()).to.equal(protocolFee);
    });

    it("Should set the right subject fee percent", async function () {
      const { telesages: telesages, subjectFee } = await loadFixture(
        deployPoolFixture
      );
      expect(await telesages.subjectFeePercent()).to.equal(subjectFee);
    });
  });

  describe("Pool Creation", function () {
    it("Should set parameters correctly", async function () {
      const { telesages: telesages, owner } = await loadFixture(
        deployPoolFixture
      );

      await telesages.createPool(0, 1, 20, 30);

      const pool = await telesages.pools(
        ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256"],
            [owner.address, 0]
          )
        )
      );

      expect(pool.owner).to.eq(owner.address);
      expect(pool.priceCurve).to.eq(1);
      expect(pool.multiPriceParam).to.eq(20);
      expect(pool.flatPriceParam).to.eq(30);
    });
    it("Should give the subject the first key", async function () {
      const { telesages: telesages, owner } = await loadFixture(
        deployPoolFixture
      );

      await telesages.createPool(0, 1, 20, 30);

      expect(await telesages.getBalance(owner.address, owner.address, 0)).to.eq(
        1
      );
    });
    it("Should revert when trying to create existing poolIndex", async function () {
      const { telesages: telesages } = await loadFixture(deployPoolFixture);

      await telesages.createPool(0, 1, 20, 30);
      await expect(telesages.createPool(0, 2, 20, 30)).to.revertedWith(
        "Pool already created"
      );
    });
    it("Should revert when trying to set non-existing curve", async function () {
      const { telesages: telesages } = await loadFixture(deployPoolFixture);

      await expect(telesages.createPool(0, 10, 20, 30)).to.reverted;
    });
    it("Should revert when using MultiPriceParam with Flat PriceCurve", async function () {
      const { telesages: telesages } = await loadFixture(deployPoolFixture);

      await expect(telesages.createPool(0, 0, 20, 30)).to.revertedWith(
        "MultiPriceParam not allowed for Fixed PriceCurve"
      );
    });
  });

  describe("buyKeys", function () {
    it("Should revert when buying 0 amount", async function () {
      const {
        telesages: telesages,
        otherAccount,
        owner,
      } = await loadFixture(deployPoolFixture);

      await telesages.createPool(0, 0, 0, 30);

      await expect(
        telesages.connect(otherAccount).buyKeys(owner.address, 0, 0)
      ).to.be.revertedWith("Minimum 1 key");
    });

    it("Should revert when providing insufficient payment", async function () {
      const {
        telesages: telesages,
        otherAccount,
        owner,
      } = await loadFixture(deployPoolFixture);

      await telesages.createPool(0, 0, 0, ethers.parseEther("1.0"));

      await expect(
        telesages.connect(otherAccount).buyKeys(owner.address, 0, 1, {
          value: ethers.parseEther("0.99"),
        })
      ).to.be.revertedWith("Insufficient payment");
    });

    it("Should revert when providing excess payment", async function () {
      const {
        telesages: telesages,
        otherAccount,
        owner,
      } = await loadFixture(deployPoolFixture);

      await telesages.createPool(0, 0, 0, ethers.parseEther("1.0"));

      await expect(
        telesages.connect(otherAccount).buyKeys(owner.address, 0, 1, {
          value: ethers.parseEther("1.01"),
        })
      ).to.be.revertedWith("Insufficient payment");
    });
  });

  describe("sellKeys", function () {
    it("Should revert when selling 0 keys", async function () {
      const {
        telesages: telesages,
        otherAccount,
        owner,
      } = await loadFixture(deployPoolFixture);

      await telesages.createPool(0, 0, 0, 10);

      await expect(
        telesages.connect(otherAccount).sellKeys(owner.address, 0, 0)
      ).to.be.revertedWith("Minimum 1 key");
    });

    it("Should revert when user has no keys", async function () {
      const {
        telesages: telesages,
        otherAccount,
        owner,
      } = await loadFixture(deployPoolFixture);

      await telesages.createPool(0, 1, 0, 10);

      await expect(
        telesages.connect(otherAccount).sellKeys(owner.address, 0, 1)
      ).to.be.revertedWith("Insufficient keys");
    });

    it("Should revert when selling in a fixed curve pool", async function () {
      const {
        telesages: telesages,
        otherAccount,
        owner,
      } = await loadFixture(deployPoolFixture);

      await telesages.createPool(0, 0, 0, 10);

      await expect(telesages.sellKeys(owner.address, 0, 1)).to.be.revertedWith(
        "Selling keys is not allowed for Fixed PriceCurve"
      );
    });

    it("Should revert when selling last key", async function () {
      const {
        telesages: telesages,
        otherAccount,
        owner,
      } = await loadFixture(deployPoolFixture);

      await telesages.createPool(0, 1, 0, 10);

      await expect(telesages.sellKeys(owner.address, 0, 1)).to.be.revertedWith(
        "Cannot sell the last key"
      );
    });

    it("Should transfer funds to user when selling", async function () {
      const {
        telesages: telesages,
        otherAccount,
        owner,
      } = await loadFixture(deployPoolFixture);

      await telesages.createPool(0, 1, 0, 10);

      await telesages.buyKeys(owner.address, 0, 1, {
        value: await telesages.getBuyPriceAfterFee(owner.address, 0, 1),
      });

      const sellPrice = await telesages.getSellPriceAfterFee(
        owner.address,
        0,
        1
      );

      await expect(
        telesages.sellKeys(owner.address, 0, 1)
      ).to.changeEtherBalance(owner, sellPrice);
    });
  });

  describe("Pricing", function () {
    it("Should use flatPriceParam as price price for fixed curve", async function () {
      const { telesages: telesages, owner } = await loadFixture(
        deployPoolFixture
      );

      await telesages.createPool(0, 0, 0, 30);

      expect(await telesages.getPoolPrice(owner.address, 0, 1, false)).to.eq(30);

      for (let i = 1; i < 10; i++) {
        expect(await telesages.getPoolPrice(owner.address, 0, i, false)).to.eq(
          30 * i,
          "Mismatch for amount " + i
        );
      }
    });
    it("Should use linear increase as price price for linear curve", async function () {
      const { telesages: telesages, owner } = await loadFixture(
        deployPoolFixture
      );

      await telesages.createPool(0, 1, 20n * ethers.parseEther("1.0"), 30);

      expect(await telesages.getPoolPrice(owner.address, 0, 0, false)).to.eq(0);

      for (let i = 1; i < 10; i++) {
        expect(await telesages.getPoolPrice(owner.address, 0, i, false)).to.eq(
          20 * ((i * (i + 1)) / 2) + 30 * i,
          "Mismatch for amount " + i
        );
      }
    });
    it("Should use quadratic increase as price price for quadratic curve", async function () {
      const { telesages: telesages, owner } = await loadFixture(
        deployPoolFixture
      );

      await telesages.createPool(0, 2, 20n * ethers.parseEther("1.0"), 30);

      expect(await telesages.getPoolPrice(owner.address, 0, 0, false)).to.eq(0);

      for (let i = 1; i < 10; i++) {
        let expectedCost = i * 30;

        for (let k = 1; k <= i; k++) {
          expectedCost += 20 * k * k;
        }

        expect(await telesages.getPoolPrice(owner.address, 0, i, false)).to.eq(
          expectedCost,
          "Mismatch for amount " + i
        );
      }
    });
  });
});
