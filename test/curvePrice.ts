import {
	time,
	loadFixture,
  } from "@nomicfoundation/hardhat-toolbox/network-helpers";
  import { expect } from "chai";
  import { ethers } from "hardhat";
  
  describe("Telesagess", function () {
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
	const multi = 5000000000000000n // 0.005
	const flat = 5000000000000000n // 0.005
  
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
  
		await telesages.createPool(0, 2, multi, flat);
  
		const expectedPriceOfNextKey = await telesages.getBuyPriceAfterFee(owner.address, 0, 1)

		await expect(
		  telesages.connect(otherAccount).buyKeys(owner.address, 0, 1, {
			value: expectedPriceOfNextKey - 1n
		  })
		).to.be.revertedWith("Insufficient payment");
	  });
  
	  it("Should revert when providing excess payment", async function () {
		const {
		  telesages: telesages,
		  otherAccount,
		  owner,
		} = await loadFixture(deployPoolFixture);
  
		await telesages.createPool(0, 2, multi, flat);
		const expectedPriceOfNextKey = await telesages.getBuyPriceAfterFee(owner.address, 0, 1)
  
		await expect(
		  telesages.connect(otherAccount).buyKeys(owner.address, 0, 1, {
			value: expectedPriceOfNextKey + 1n
		  })
		).to.be.revertedWith("Excess payment");
	  });
	  
	  it("Should have correct price after purchase of multiple keys at once", async function() {
		const {
			telesages,
			otherAccount,
			owner
		} = await loadFixture(deployPoolFixture)

		await telesages.createPool(0, 2, multi, flat)
		
		await telesages.connect(otherAccount).buyKeys(owner.address, 0, 9, {
			value: await telesages.getBuyPriceAfterFee(owner.address, 0, 9)
		})

		expect(
			await telesages.getPoolPrice(owner.address, 0, 1, false)
		).to.eq(505000000000000000n)
	  })
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
		  protocolFeeDestination,
		} = await loadFixture(deployPoolFixture);
  		
		await telesages.createPool(0, 2, multi, flat);
	
		const ProtocolInit = Number(await ethers.provider.getBalance(protocolFeeDestination.address)) / 1e18
		const OwnerInit = Number(await ethers.provider.getBalance(owner.address)) / 1e18
		const OtherInit = Number(await ethers.provider.getBalance(otherAccount.address)) / 1e18
		console.log({
			ProtocolInit,
			OwnerInit,
			OtherInit
		})

		const buyPrice = await telesages.getBuyPrice(owner.address, 0, 3)
		const buyPriceAfterFee = await telesages.getBuyPriceAfterFee(owner.address, 0, 3)
		console.log('---------- buying 3 keys ----------------')
		console.log('buyPrice', Number(buyPrice) / 1e18)
		console.log('buyPriceAfterFee', Number(buyPriceAfterFee) / 1e18)
		console.log('fees', Number(buyPriceAfterFee - buyPrice) / 1e18)
		
		await telesages.connect(otherAccount).buyKeys(
			owner.address, 0, 3, { value: buyPriceAfterFee }
		)

		const balanceProtocolAfterBuy = Number(await ethers.provider.getBalance(protocolFeeDestination.address)) / 1e18
		const balanceOwnerAfterBuy = Number(await ethers.provider.getBalance(owner.address)) / 1e18
		const balanceOtherAfterBuy = Number(await ethers.provider.getBalance(otherAccount.address)) / 1e18

		console.log({
			diffAfterBuy: {
				protocol: balanceProtocolAfterBuy - OtherInit,
				owner: balanceOwnerAfterBuy - OtherInit,
				other: balanceOtherAfterBuy - OtherInit
			},
			balanceAfterBuy: {
				protocol: balanceProtocolAfterBuy,
				owner: balanceOwnerAfterBuy,
				other: balanceOtherAfterBuy,

			}
		})
		console.log('-----------------------------------------')


		let balance = await ethers.provider.getBalance(telesages.getAddress());
		console.log(`Contract balance: ${balance} ETH`);

		console.log('\n')
		console.log('------------- sell 1 key ----------------')
		const sellPrice = BigInt(await telesages.getSellPrice(owner.address, 0, 1))
		const sellPriceAfterFee = BigInt(await telesages.getSellPriceAfterFee(owner.address, 0, 1))
		const fees = (sellPrice - sellPriceAfterFee) / 2n
		
		console.log({
			sellPrice,
			sellPriceAfterFee,
			sellFees: sellPrice - sellPriceAfterFee
		})

		await expect(
			telesages.connect(otherAccount).sellKeys(owner.address, 0, 1)
		).to.changeEtherBalances(
			[otherAccount, protocolFeeDestination, owner],
			[sellPriceAfterFee, fees, fees]
		)

		const protocolAfterSell = Number(await ethers.provider.getBalance(protocolFeeDestination.address)) / 1e18
		const ownerAfterSell = Number(await ethers.provider.getBalance(owner.address)) / 1e18
		const otherAfterSell = Number(await ethers.provider.getBalance(otherAccount.address)) / 1e18

		console.log({
			diffAfterSell: {
				protocol: protocolAfterSell - balanceProtocolAfterBuy,
				owner: ownerAfterSell - balanceOwnerAfterBuy,
				other: otherAfterSell - balanceOtherAfterBuy
			}
		})
	  });
	});
  
	describe("Pricing", function () {
	  it("Should use linear increase as price price for linear curve", async function () {
		const { telesages: telesages, owner } = await loadFixture(
		  deployPoolFixture
		);
  
		await telesages.createPool(0, 1, 1000000000000000000n, 5000000000000000000n);
  
		expect(await telesages.getPoolPrice(owner.address, 0, 0, false)).to.eq(0);
  
		for (let i = 1; i < 10; i++) {
			// console.log(`expect i: ${i} = ${await telesages.getPoolPrice(owner.address, 0, i)}`)
			// console.log(`but it equals to: ${1000000000000000000n * ((BigInt(i) * (BigInt(i) + BigInt(1))) / BigInt(2)) + 5000000000000000000n * BigInt(i)}`)
		  expect(await telesages.getPoolPrice(owner.address, 0, i, false)).to.eq(
			1000000000000000000n * ((BigInt(i) * (BigInt(i) + BigInt(1))) / BigInt(2)) + 5000000000000000000n * BigInt(i),
			"Mismatch for amount " + i
		  );
		}
	  });
	  it("Should use quadratic increase as price price for quadratic curve", async function () {
		const { telesages: telesages, owner } = await loadFixture(
		  deployPoolFixture
		);
  
		const multi = 5000000000000000n // 0.005
		const flat = 5000000000000000n // 0.005

		await telesages.createPool(0, 2, multi, flat);
  
		expect(await telesages.getPoolPrice(owner.address, 0, 0, false)).to.eq(0);
  

		// uint256 sum1 = (supply - 1 )* (supply) * (2 * (supply - 1) + 1) / 6;
		// uint256 sum2 = (supply - 1 + amount) * (supply + amount) * (2 * (supply - 1 + amount) + 1) / 6;
		// uint256 summation = sum2 - sum1;
		// return 
		// 	multiPriceParam * summation 
		// 	+ amount * flatPriceParam;
		// WHERE AMOUNT = 1

		for (let i = 1; i < 21; i++) {
			const _i = BigInt(i)
			const _1 = BigInt(1)
			const _2 = BigInt(2)
			const _6 = BigInt(6)
			let sum1 = (_i - _1) * _i * (_2 * (_i - _1) + _1) / _6
			let sum2 = _i * (_i + _1) * (_2 * _i + _1) / _6

			let expectedCost = multi * (sum2 - sum1) + flat

		//   console.log(expectedCost)
		//   console.log(await telesages.getPoolPrice(owner.address, 0, i))
		//   console.log(`i: ${i} -- `, Number((await telesages.getCurvePrice(2, multi, flat, i, 1)).toString()) / 1e18)

		  expect(await telesages.getCurvePrice(2, multi, flat, i, 1)).to.eq(
			expectedCost,
			"Mismatch for amount " + i
		  );
		}
	  });
	});
  });
  