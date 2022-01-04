import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers, upgrades } from "hardhat";
import { expandTo18Decimals } from "./utilities";

describe("Distributions", function () {
  beforeEach(async function () {
    this.signers = await ethers.getSigners();
    this.deployer = this.signers[0];
    this.bob = this.signers[1];
    this.fee = this.signers[2];

    this.Distributions = await ethers.getContractFactory("Distributions");
    this.HODL = await ethers.getContractFactory("HODLToken");
    this.ERC20Mock = await ethers.getContractFactory(
      "ERC20Mock",
      this.deployer
    );
    this.distributions = await upgrades.deployProxy(this.Distributions, [], {
      initializer: "__Distributions_init",
    });
    await this.distributions.deployed();

    this.usdt = await this.ERC20Mock.deploy(
      "usdt",
      "usdt",
      expandTo18Decimals(100000)
    );
    await this.usdt.deployed();

    this.uHODL = await this.HODL.deploy(
      this.usdt.address,
      this.distributions.address,
      "uHODL"
    );
    await this.uHODL.deployed();

    await expect(
      this.distributions.connect(this.deployer).setHodlWithdrawFee(3)
    )
      .to.emit(this.distributions, "HodlWithdrawFeeRatioChanged")
      .withArgs(0, 3);

    await expect(
      this.distributions
        .connect(this.deployer)
        .setHodlWithdrawFeeDistribution([100], [this.fee.address])
    )
      .to.emit(this.distributions, "HodlWithdrawFeeDistributionSetted")
      .withArgs([100], [this.fee.address]);
  });
  it("User can deposit -> withdraw, and withdraw fee is correct", async function () {
    await this.usdt
      .connect(this.deployer)
      .transfer(this.bob.address, expandTo18Decimals(1000));
    await this.usdt
      .connect(this.bob)
      .approve(this.uHODL.address, expandTo18Decimals(1000), {
        from: this.bob.address,
      });

    await this.uHODL.connect(this.bob).deposit(expandTo18Decimals(1000));
    expect(await this.usdt.balanceOf(this.bob.address)).to.equal(
      BigNumber.from(0)
    );
    expect(await this.uHODL.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(1000)
    );

    await this.uHODL.connect(this.bob).withdraw(expandTo18Decimals(1000));
    expect(await this.usdt.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(997)
    );
    expect(await this.usdt.balanceOf(this.fee.address)).to.equal(
      expandTo18Decimals(3)
    );
    expect(await this.uHODL.balanceOf(this.bob.address)).to.equal(
      BigNumber.from(0)
    );
  });
});
