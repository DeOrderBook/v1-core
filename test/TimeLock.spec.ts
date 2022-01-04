import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { duration, encodeParameters, increase, latest } from "./utilities";

describe("Timelock", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.alice = this.signers[0];
    this.bob = this.signers[1];

    this.Distributions = await ethers.getContractFactory("Distributions");
    this.Timelock = await ethers.getContractFactory("Timelock");
  });

  beforeEach(async function () {
    this.distributions = await upgrades.deployProxy(this.Distributions, [], {
      initializer: "__Distributions_init",
    });
    this.timelock = await this.Timelock.deploy(this.bob.address, "259200");
    await this.distributions.transferOwnership(this.timelock.address);
  });

  it("should not allow non-owner to do operation", async function () {
    await expect(this.distributions.setExerciseFee(90)).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
    await expect(
      this.distributions.connect(this.bob).setExerciseFee(90)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      this.timelock.queueTransaction(
        this.distributions.address,
        "0",
        "ssetExerciseFee(uint8)",
        encodeParameters(["uint8"], [90]),
        (await latest()).add(duration.days(4))
      )
    ).to.be.revertedWith(
      "Timelock::queueTransaction: Call must come from admin."
    );
  });

  it("should do the timelock thing", async function () {
    expect(await this.distributions.exerciseFeeRatio()).to.equal(0);

    const eta = (await latest()).add(duration.days(4));
    await this.timelock
      .connect(this.bob)
      .queueTransaction(
        this.distributions.address,
        "0",
        "setExerciseFee(uint8)",
        encodeParameters(["uint8"], [90]),
        eta
      );
    expect(await this.distributions.exerciseFeeRatio()).to.equal(0);

    await increase(duration.days(1));
    await expect(
      this.timelock
        .connect(this.bob)
        .executeTransaction(
          this.distributions.address,
          "0",
          "setExerciseFee(uint8)",
          encodeParameters(["uint8"], [90]),
          eta
        )
    ).to.be.revertedWith(
      "Timelock::executeTransaction: Transaction hasn't surpassed time lock."
    );
    expect(await this.distributions.exerciseFeeRatio()).to.equal(0);

    await increase(duration.days(3));
    await this.timelock
      .connect(this.bob)
      .executeTransaction(
        this.distributions.address,
        "0",
        "setExerciseFee(uint8)",
        encodeParameters(["uint8"], [90]),
        eta
      );
    expect(await this.distributions.exerciseFeeRatio()).to.equal(90);
  });
});
