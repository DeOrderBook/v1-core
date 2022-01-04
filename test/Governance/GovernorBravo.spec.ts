// Start - Support direct Mocha run & debug
import "@nomiclabs/hardhat-ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
// End - Support direct Mocha run & debug
import chai, { expect } from "chai";
import { solidity } from "ethereum-waffle";
import "hardhat";
import { ethers } from "hardhat";
import { before } from "mocha";
import {
  DOB,
  GovernorBravoDelegate,
  GovernorBravoDelegator,
  Timelock,
  Treasury,
} from "../../types";
import { advanceBlockTo, duration, increase, latest } from "../utilities/time";

// Wires up Waffle with Chai
chai.use(solidity);

const TREASURY_FUNDS = "1000000000000000000000000000";
const VOTING_POWER = "100000000000000000000000000";

const provider = ethers.provider;
const PROPOSAL_SPAN = 5;
const abiCoder = new ethers.utils.AbiCoder();
// Governance.ProposalState in contracts/Governance.sol.
enum ProposalState {
  Pending,
  Active,
  Canceled,
  Defeated,
  Succeeded,
  Queued,
  Expired,
  Executed,
}

describe("GovernorBravo", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.admin = this.signers[0];
    this.delegatee1 = this.signers[1];
    this.delegatee2 = this.signers[2];
    this.delegatee3 = this.signers[3];
    this.delegatee4 = this.signers[4];
    this.delegatee5 = this.signers[5];
    this.receiver = this.signers[6];
    this.GovernorBravoDelegate = await ethers.getContractFactory(
      "GovernorBravoDelegate"
    );
    this.GovernorBravoDelegator = await ethers.getContractFactory(
      "GovernorBravoDelegator"
    );
    this.Timelock = await ethers.getContractFactory("Timelock");
    this.DOB = await ethers.getContractFactory("DOB");
    this.Treasury = await ethers.getContractFactory("Treasury");
    this.timelock = <Timelock>(
      await this.Timelock.deploy(this.admin.address, duration.days(2))
    );
    await this.timelock.deployed();
    this.dob = <DOB>await this.DOB.deploy(this.admin.address);
    await this.dob.deployed();
    this.governorDelegate = <GovernorBravoDelegate>(
      await this.GovernorBravoDelegate.deploy()
    );
    await this.governorDelegate.deployed();
    this.governorDelegator = <GovernorBravoDelegator>(
      await this.GovernorBravoDelegator.deploy(
        this.timelock.address,
        this.dob.address,
        this.admin.address,
        this.governorDelegate.address,
        PROPOSAL_SPAN,
        0,
        VOTING_POWER
      )
    );
    await this.governorDelegator.deployed();
    this.governor = <GovernorBravoDelegate>(
      await this.GovernorBravoDelegate.attach(this.governorDelegator.address)
    );

    this.treasury = <Treasury>await this.Treasury.deploy();
    await this.treasury.deployed();
    await this.treasury.initialize(
      this.governor.address,
      this.timelock.address
    );

    const eta = (await latest()).add(duration.days(3));
    await this.timelock.queueTransaction(
      this.timelock.address,
      0,
      "setPendingAdmin(address)",
      abiCoder.encode(["address"], [this.governor.address]),
      eta
    );
    await increase(duration.days(4));
    await this.timelock.executeTransaction(
      this.timelock.address,
      0,
      "setPendingAdmin(address)",
      abiCoder.encode(["address"], [this.governor.address]),
      eta
    );
    await this.governor.initiate();

    await this.dob.transfer(this.delegatee1.address, VOTING_POWER);
    await this.dob.connect(this.delegatee1).delegate(this.delegatee1.address);
    await this.dob.transfer(this.delegatee2.address, VOTING_POWER);
    await this.dob.connect(this.delegatee2).delegate(this.delegatee2.address);
    await this.dob.transfer(this.delegatee3.address, VOTING_POWER);
    await this.dob.connect(this.delegatee3).delegate(this.delegatee3.address);
    await this.dob.transfer(this.delegatee4.address, VOTING_POWER);
    await this.dob.connect(this.delegatee4).delegate(this.delegatee4.address);
    await this.dob.transfer(this.delegatee5.address, VOTING_POWER);
    await this.dob.connect(this.delegatee5).delegate(this.delegatee5.address);

    this.runProposal = async function (
      proposer: SignerWithAddress,
      proposalTargets: string[],
      proposalValues: string[],
      proposalSignatures: string[],
      proposalCalldatas: string[],
      description: string,
      proposalVotesTypes: string[],
      proposalVotes: number[]
    ): Promise<string> {
      await this.governor
        .connect(proposer)
        .propose(
          proposalTargets,
          proposalValues,
          proposalSignatures,
          proposalCalldatas,
          description,
          proposalVotesTypes
        );
      const proposalId = await this.governor.proposalCount();
      let state = await this.governor.state(proposalId);
      expect(state).to.equal(ProposalState.Pending);

      this.castVoteAndCheck = async function (
        proposalId: string,
        voter: SignerWithAddress,
        support: number
      ): Promise<void> {
        await this.governor.connect(voter).castVote(proposalId, support);
        const receipt = await this.governor.getReceipt(
          proposalId,
          voter.address
        );
        expect(receipt.votes).to.equal(VOTING_POWER);
        expect(receipt.support).to.equal(support);
      };

      await this.castVoteAndCheck(
        proposalId,
        this.delegatee1,
        proposalVotes[0]
      );
      await this.castVoteAndCheck(
        proposalId,
        this.delegatee2,
        proposalVotes[1]
      );
      await this.castVoteAndCheck(
        proposalId,
        this.delegatee3,
        proposalVotes[2]
      );
      await this.castVoteAndCheck(
        proposalId,
        this.delegatee4,
        proposalVotes[3]
      );
      await this.castVoteAndCheck(
        proposalId,
        this.delegatee5,
        proposalVotes[4]
      );

      await advanceBlockTo((await provider.getBlockNumber()) + PROPOSAL_SPAN);
      state = await this.governor.state(proposalId);
      expect(state).to.equal(ProposalState.Succeeded);
      await this.governor.queue(proposalId);
      state = await this.governor.state(proposalId);
      expect(state).to.equal(ProposalState.Queued);
      await increase(duration.days(2));
      await this.governor.execute(proposalId);
      state = await this.governor.state(proposalId);
      expect(state).to.equal(ProposalState.Executed);
      return proposalId;
    };
  });

  it("Verify initial governor state", async function () {
    const blockNum = await provider.getBlockNumber();
    await advanceBlockTo((await provider.getBlockNumber()) + 1);
    expect(
      await this.dob.getPriorVotes(this.delegatee1.address, blockNum)
    ).to.equal(VOTING_POWER);
    expect(
      await this.dob.getPriorVotes(this.delegatee2.address, blockNum)
    ).to.equal(VOTING_POWER);
    expect(
      await this.dob.getPriorVotes(this.delegatee3.address, blockNum)
    ).to.equal(VOTING_POWER);
  });

  it("Run TREASURY proposal to transfer funds", async function () {
    await this.dob.transfer(this.treasury.address, TREASURY_FUNDS);
    expect(await this.dob.balanceOf(this.treasury.address)).to.equal(
      TREASURY_FUNDS
    );

    const proposalSignatures: string[] = ["transfer(address,address,uint256)"];
    const proposalValues: string[] = ["0"];
    const proposalTargets: string[] = [this.treasury.address];
    const proposalVotesTypes: string[] = ["against", "for"];
    const proposalVotes: number[] = [1, 1, 1, 0, 0];
    const description = "Transfer some dob";
    const proposalCalldatas: string[] = [
      abiCoder.encode(
        ["address", "address", "uint256"],
        [this.receiver.address, this.dob.address, TREASURY_FUNDS]
      ),
    ];

    expect(await this.dob.balanceOf(this.receiver.address)).to.equal(0);
    expect(await this.dob.balanceOf(this.treasury.address)).to.equal(
      TREASURY_FUNDS
    );
    await this.runProposal(
      this.delegatee1,
      proposalTargets,
      proposalValues,
      proposalSignatures,
      proposalCalldatas,
      description,
      proposalVotesTypes,
      proposalVotes
    );
    expect(await this.dob.balanceOf(this.receiver.address)).to.equal(
      TREASURY_FUNDS
    );
    expect(await this.dob.balanceOf(this.treasury.address)).to.equal(0);
  });

  it("Run TREASURY proposal to transfer funds with 4 votes types", async function () {
    await this.dob
      .connect(this.receiver)
      .transfer(this.treasury.address, TREASURY_FUNDS);
    expect(await this.dob.balanceOf(this.treasury.address)).to.equal(
      TREASURY_FUNDS
    );

    const proposalSignatures: string[] = ["transfer(address,address,uint256)"];
    const proposalValues: string[] = ["0"];
    const proposalTargets: string[] = [this.treasury.address];
    const proposalVotesTypes: string[] = ["against", "for", "abstain", "slash"];
    const proposalVotes: number[] = [1, 1, 1, 2, 3];
    const description = "Transfer some dob";
    const proposalCalldatas: string[] = [
      abiCoder.encode(
        ["address", "address", "uint256"],
        [this.receiver.address, this.dob.address, TREASURY_FUNDS]
      ),
    ];

    expect(await this.dob.balanceOf(this.receiver.address)).to.equal(0);
    expect(await this.dob.balanceOf(this.treasury.address)).to.equal(
      TREASURY_FUNDS
    );
    await this.runProposal(
      this.delegatee1,
      proposalTargets,
      proposalValues,
      proposalSignatures,
      proposalCalldatas,
      description,
      proposalVotesTypes,
      proposalVotes
    );
    expect(await this.dob.balanceOf(this.receiver.address)).to.equal(
      TREASURY_FUNDS
    );
    expect(await this.dob.balanceOf(this.treasury.address)).to.equal(0);
  });
});
