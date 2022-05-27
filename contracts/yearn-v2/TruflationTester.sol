// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";
import "@chainlink/contracts/src/v0.8/ConfirmedOwner.sol";
import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";


contract TruflationTester is ChainlinkClient, ConfirmedOwner, KeeperCompatibleInterface {
  using Chainlink for Chainlink.Request;
  
  string public yoyInflation;
  int256 public inflationWei;
  address public oracleId;
  string public jobId;
  uint256 public fee;


  uint public immutable interval; //84600 seconds in a day - use for deploying
  uint public lastTimeStamp;

  event InflationUpdated(
    int256 inflationWei
  );
  // Please refer to
  // https://github.com/truflation/quickstart/blob/main/network.md
  // for oracle address. job id, and fee for a given network

  constructor(address oracleId_, string memory jobId_, uint256 fee_, uint updateInterval) ConfirmedOwner(msg.sender) {
    setPublicChainlinkToken();
    oracleId = oracleId_;
    jobId = jobId_;
    fee = fee_;
    interval = updateInterval;
    lastTimeStamp = block.timestamp;
  }


  function requestYoyInflation() public returns (bytes32 requestId) {
    Chainlink.Request memory req = buildChainlinkRequest(
      bytes32(bytes(jobId)),
      address(this),
      this.fulfillYoyInflation.selector
    );
    req.add("service", "truflation/current");
    req.add("keypath", "yearOverYearInflation");
    req.add("abi", "json");
    return sendChainlinkRequestTo(oracleId, req, fee);
  }

  function fulfillYoyInflation(
    bytes32 _requestId,
    bytes memory _inflation
  ) public recordChainlinkFulfillment(_requestId) {
    yoyInflation = string(_inflation);
  }

  function changeOracle(address _oracle) public onlyOwner {
    oracleId = _oracle;
  }

  function changeJobId(string memory _jobId) public onlyOwner {
    jobId = _jobId;
  }

  function getChainlinkToken() public view returns (address) {
    return chainlinkTokenAddress();
  }

  function withdrawLink() public onlyOwner {
    LinkTokenInterface link = LinkTokenInterface(chainlinkTokenAddress());
    require(link.transfer(msg.sender, link.balanceOf(address(this))),
    "Unable to transfer");
  }

  // The following are for retrieving inflation in terms of wei
  // This is useful in situations where you want to do numerical
  // processing of values within the smart contract

  // This will require a int256 rather than a uint256 as inflation
  // can be negative

  function requestInflationWei() public returns (bytes32 requestId) {
    Chainlink.Request memory req = buildChainlinkRequest(
      bytes32(bytes(jobId)),
      address(this),
      this.fulfillInflationWei.selector
    );
    req.add("service", "truflation/current");
    req.add("keypath", "yearOverYearInflation");
    req.add("abi", "int256");
    req.add("multiplier", "1000000000000000000");
    return sendChainlinkRequestTo(oracleId, req, fee);
  }

  function fulfillInflationWei(
    bytes32 _requestId,
    bytes memory _inflation
  ) public recordChainlinkFulfillment(_requestId) {
    inflationWei = toInt256(_inflation);
  }

  function toInt256(bytes memory _bytes) internal pure
  returns (int256 value) {
    assembly {
      value := mload(add(_bytes, 0x20))
    }
  }

  function checkUpkeep(bytes calldata /* checkData */) external view returns (bool upkeepNeeded, bytes memory /* performData */) {
      upkeepNeeded = (block.timestamp - lastTimeStamp) > interval;
      // We don't use the checkData in this example. The checkData is defined when the Upkeep was registered.
  }

  function performUpkeep(bytes calldata /* performData */) external {
      //We highly recommend revalidating the upkeep in the performUpkeep function
      if ((block.timestamp - lastTimeStamp) > interval ) {
          lastTimeStamp = block.timestamp;
          requestInflationWei();
          inflationWei;
      }
        // We don't use the performData in this example. The performData is generated by the Keeper's call to your checkUpkeep function
  }  

}