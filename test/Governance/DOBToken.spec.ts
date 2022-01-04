import "@nomiclabs/hardhat-ethers";
import chai, { expect } from "chai";
import { solidity } from "ethereum-waffle";
import "hardhat";
import { ethers } from "hardhat";
import { before } from "mocha";
import { DOB } from "../../types";
import { expandTo18Decimals } from "../utilities";

chai.use(solidity);

const TEN_BILLION = expandTo18Decimals(10000000000);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("DOB token contract", async () => {
  let admin: string;
  let dob: DOB;
  let alice: string;
  let bob: string;

  before(async () => {
    admin = await signer(0);
    dob = await dobInit(admin);
  });

  it("name is DeOrderBook", async () => {
    expect(await dob.name()).to.equal("DeOrderBook");
  });

  it("symbol is DOB", async () => {
    expect(await dob.symbol()).to.equal("DOB");
  });

  it("zero votes for the admin by default", async () => {
    expect(await dob.getCurrentVotes(admin)).to.equal(0);
  });

  it("contract creator gets 10 billion (1e28 / 1e10 * 1e18) DOBs", async () => {
    expect(await dob.balanceOf(admin)).to.equal(TEN_BILLION);
  });

  it("minting DOB not allowed", async () => {
    expect(dob.transferFrom(ZERO_ADDRESS, admin, 5)).to.be.revertedWith(
      "ERC20: transfer from the zero address"
    );
  });

  it("burning DOB not allowed", async () => {
    expect(dob.transferFrom(admin, ZERO_ADDRESS, 5)).to.be.revertedWith(
      "ERC20: transfer to the zero address"
    );
  });

  describe("delegate", async () => {
    beforeEach(async () => {
      admin = await signer(0);
      alice = await signer(1);
      bob = await signer(2);
      dob = await dobInit(admin);
    });

    it("admin assign ten billion (all) votes to itself", async () => {
      expect(await dob.getCurrentVotes(admin)).to.equal(0);

      await dob.delegate(admin);

      expect(await dob.getCurrentVotes(admin)).to.equal(TEN_BILLION);
    });

    it("admin assign ten billion (all) votes to a delegate", async () => {
      expect(await dob.getCurrentVotes(admin)).to.equal(0);
      expect(await dob.getCurrentVotes(alice)).to.equal(0);

      await dob.delegate(alice);

      expect(await dob.getCurrentVotes(admin)).to.equal(0);
      expect(await dob.getCurrentVotes(alice)).to.equal(TEN_BILLION);
    });

    it("admin assign ten billion (all) votes to a delegate, reassigns to another", async () => {
      expect(await dob.getCurrentVotes(admin)).to.equal(0);
      expect(await dob.getCurrentVotes(alice)).to.equal(0);
      expect(await dob.getCurrentVotes(bob)).to.equal(0);

      await dob.delegate(alice);
      await dob.delegate(bob);

      expect(await dob.getCurrentVotes(admin)).to.equal(0);
      expect(await dob.getCurrentVotes(alice)).to.equal(0);
      expect(await dob.getCurrentVotes(bob)).to.equal(TEN_BILLION);
    });
  });
});

async function dobInit(creatorAccount: string): Promise<DOB> {
  const factory = await ethers.getContractFactory("DOB");
  const dob = <DOB>await factory.deploy(creatorAccount);
  return dob.deployed();
}

async function signer(index: number): Promise<string> {
  const signers = await ethers.getSigners();
  expect(signers.length).is.greaterThan(index);
  return signers[index].address;
}
