const MetaCoin = artifacts.require("MetaCoin");
const LendingContract = artifacts.require("LendingContract");

module.exports = function (deployer, network, accounts) {
  deployer.deploy(MetaCoin, '1000000000000000000000', 'MetaCoin', 18, 'MTC').then(function () {
    return deployer.deploy(LendingContract, accounts[0], accounts[1], 3170979198, MetaCoin.address);
  });
};
