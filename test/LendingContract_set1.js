// Ok before you read any further, please note that I haven't written unit tests... Or any tests, since 2012, and am not enthusastic to doing so
// Saying "it's a bit rough", would be a compliment.

const LendingContract = artifacts.require("LendingContract");
const MetaCoin = artifacts.require("MetaCoin");
const PriceUpdaterTest = artifacts.require("PriceUpdater");
const BN = web3.utils.BN;

function nBN(val) {
  return new BN(val);
}

function toWei(val) {
  return new BN(val.toFixed(3)*1000).mul(new BN('1000000000000000')).toString(10,0); 
}

function sleep(sleepTime) { // await sleep
  return new Promise(resolve => setTimeout(resolve, sleepTime*1000));
}

contract('LendingContract', (accounts) => {
  it('proper flow - premature close', async () => { // size: 1000000000000000000
		const metaCoinInstance = await MetaCoin.deployed();
    const lendingContractInstance = await LendingContract.deployed();
    const priceUpdater = await lendingContractInstance.priceUpdater.call();
    const priceUpdaterInstance = await PriceUpdaterTest.at(priceUpdater);
		const lender = await lendingContractInstance.lender.call();
		const borrower = await lendingContractInstance.borrower.call();
		const rate = await lendingContractInstance.rate.call();
    const tokenContract = await lendingContractInstance.tokenContract.call();
    const account1 = accounts[0]; // also lender and contract creator
    const account2 = accounts[1];

    // Basic sanity checks
		assert.equal(lender.valueOf(), account1, "Lender is incorrect");
		assert.equal(borrower.valueOf(), account2, "Borrower is incorrect");
		assert.equal(rate.valueOf(), 3170979198, "Rate is incorrect");
		assert.equal(tokenContract.valueOf(), metaCoinInstance.address, "Token contract is incorrect");
    assert.equal((await lendingContractInstance.currentStage.call()).valueOf(), '1', "contract stage not waiting for tokens"); // would probably be smarter to make a corresponding enum here too but ehh

    // Giving the test subject some tokens, making sure test metacoin works
    await metaCoinInstance.transfer(account2, '100000000000000000000', { from: account1 }); // spread the wealth, we'll need a bit extra as dust accumulates
		assert.equal((await metaCoinInstance.balanceOf.call(account2)).valueOf(), '100000000000000000000', "Giveth bad amount");
    assert.equal((await metaCoinInstance.balanceOf.call(account1)).valueOf(), '900000000000000000000', "Remainth bad amount");
    
    // Depositing tokens into the lending contract
    await metaCoinInstance.approve(lendingContractInstance.address, '200000000000000000000', { from: account1 });
    await lendingContractInstance.depositTokens('200000000000000000000', { from: account1 });
    assert.equal((await metaCoinInstance.balanceOf.call(account1)).valueOf(), '700000000000000000000', "Depositing tokens didn't work (token contract)");
    assert.equal((await lendingContractInstance.tokensDeposited.call()).valueOf(), '200000000000000000000', "Depositing tokens didn't work (lending contract)");
    assert.equal((await lendingContractInstance.currentStage.call()).valueOf(), '2', "contract stage not waiting for collateral");
    
    // Retreving the tokens prematurely
    await lendingContractInstance.withdrawTokensPrematurely(false, { from: account1 }); // false - don't self destruct
    assert.equal((await metaCoinInstance.balanceOf.call(account1)).valueOf(), '900000000000000000000', "Retreiving tokens didn't work (token contract)");
    assert.equal((await lendingContractInstance.tokensDeposited.call()).valueOf(), '0', "Retreiving tokens didn't work (lending contract)"); // Contract is destroyed by this point
    assert.equal((await lendingContractInstance.currentStage.call()).valueOf(), '4', "contract stage not finished");
  });
});

contract('LendingContract', (accounts) => {
  it('proper flow - making sure liquidation danger makes sense', async () => { // size: 1000000000000000000
		const metaCoinInstance = await MetaCoin.deployed();
    const lendingContractInstance = await LendingContract.deployed();
    const priceUpdater = await lendingContractInstance.priceUpdater.call();
    const priceUpdaterInstance = await PriceUpdaterTest.at(priceUpdater);
		const lender = await lendingContractInstance.lender.call();
		const borrower = await lendingContractInstance.borrower.call();
		const rate = await lendingContractInstance.rate.call();
    const tokenContract = await lendingContractInstance.tokenContract.call();
    const account1 = accounts[0]; // lender and contract creator
    const account2 = accounts[1]; // borrower

    // Basic sanity checks
		assert.equal(lender.valueOf(), account1, "Lender is incorrect");
		assert.equal(borrower.valueOf(), account2, "Borrower is incorrect");
		assert.equal(rate.valueOf(), 3170979198, "Rate is incorrect");
		assert.equal(tokenContract.valueOf(), metaCoinInstance.address, "Token contract is incorrect");
    assert.equal((await lendingContractInstance.currentStage.call()).valueOf(), '1', "contract stage not waiting for tokens"); // would probably be smarter to make a corresponding enum here too but ehh

    // Giving the test subject some tokens, making sure test metacoin works
    await metaCoinInstance.transfer(account2, '100000000000000000000', { from: account1 }); // spread the wealth, we'll need a bit extra as dust accumulates
		assert.equal((await metaCoinInstance.balanceOf.call(account2)).valueOf(), '100000000000000000000', "Giveth bad amount");
    assert.equal((await metaCoinInstance.balanceOf.call(account1)).valueOf(), '900000000000000000000', "Remainth bad amount");
    
    // Depositing tokens into the lending contract
    await metaCoinInstance.approve(lendingContractInstance.address, '200000000000000000000', { from: account1 });
    await lendingContractInstance.depositTokens('200000000000000000000', { from: account1 });
    assert.equal((await metaCoinInstance.balanceOf.call(account1)).valueOf(), '700000000000000000000', "Depositing tokens didn't work (token contract)");
    assert.equal((await lendingContractInstance.tokensDeposited.call()).valueOf(), '200000000000000000000', "Depositing tokens didn't work (lending contract)");
    assert.equal((await lendingContractInstance.currentStage.call()).valueOf(), '2', "contract stage not waiting for collateral");
    
    // Update price, normal
    await priceUpdaterInstance.updatePriceTest('3798500', { from: account1 }); // 0.00379850 ETH per LINK // 3798500 in gwei
    assert.equal((await priceUpdaterInstance.getPrice.call()).valueOf(), '3798500', "Price update didn't work (price updating contract)");
    
    // Deposit collateral, about 250%, sign contract
    await lendingContractInstance.sign({ from: account2, value: toWei(1.9) });
    assert.equal((await lendingContractInstance.collateralDeposited.call()).valueOf(), toWei(1.9), "contract collateral wrong");
    assert.equal((await lendingContractInstance.getLiquidationDanger.call()).valueOf(), false, "In liquidation danger when shouldn't be! (300%)");
    assert.equal((await lendingContractInstance.currentStage.call()).valueOf(), '3', "contract stage not working");
    assert.equal((await metaCoinInstance.balanceOf.call(account2)).valueOf(), '300000000000000000000', "Loaned tokens didn't pass (token contract)");

    // Update price, get the price to 200% collateral, make sure we're not liquidated
    await priceUpdaterInstance.updatePriceTest('4750000', { from: account1 }); // 0.00475000 ETH per LINK // 4750000 in gwei
    assert.equal((await priceUpdaterInstance.getPrice.call()).valueOf(), '4750000', "Price update didn't work (price updating contract)");
    assert.equal((await lendingContractInstance.getLiquidationDanger.call()).valueOf(), false, "In liquidation danger when shouldn't be! (200%)");

    // Update price to 125%, make sure the liquidation makes sense 
    await priceUpdaterInstance.updatePriceTest('7600000', { from: account2 }); // anyone can initiate update price
    assert.equal((await priceUpdaterInstance.getPrice.call()).valueOf(), '7600000', "Price update didn't work (price updating contract)");
    assert.equal((await lendingContractInstance.getLiquidationDanger.call()).valueOf(), true, "NOT In liquidation danger when should be! (125%)");

    // Update price to 10%, make sure the liquidation makes sense
    await priceUpdaterInstance.updatePriceTest('95000000', { from: account1 }); // 0.09500000 -> 95000000 in gwei
    assert.equal((await priceUpdaterInstance.getPrice.call()).valueOf(), '95000000', "Price update didn't work (price updating contract)");
    assert.equal((await lendingContractInstance.getLiquidationDanger.call()).valueOf(), true, "NOT In liquidation danger when should be! (10%)");

    // Update price to 1000% collateral, make sure values make sense
    await priceUpdaterInstance.updatePriceTest('950000', { from: account2 });
    assert.equal((await priceUpdaterInstance.getPrice.call()).valueOf(), '950000', "Price update didn't work (price updating contract)");
    assert.equal((await lendingContractInstance.getLiquidationDanger.call()).valueOf(), false, "In liquidation danger when shouldn't be! (1000%)");
    
    // Update price to 155% collateral, make sure values make sense
    await priceUpdaterInstance.updatePriceTest('6120000', { from: account2 }); // 0.00612000 -> 6120000
    assert.equal((await priceUpdaterInstance.getPrice.call()).valueOf(), '6120000', "Price update didn't work (price updating contract)");
    assert.equal((await lendingContractInstance.getLiquidationDanger.call()).valueOf(), false, "In liquidation danger when shouldn't be! (155%)");
  });
});

contract('LendingContract', (accounts) => {
  it('proper flow - return tokens', async () => { // size: 1000000000000000000
		const metaCoinInstance = await MetaCoin.deployed();
    const lendingContractInstance = await LendingContract.deployed();
    const priceUpdater = await lendingContractInstance.priceUpdater.call();
    const priceUpdaterInstance = await PriceUpdaterTest.at(priceUpdater);
		const lender = await lendingContractInstance.lender.call();
		const borrower = await lendingContractInstance.borrower.call();
		const rate = await lendingContractInstance.rate.call();
    const tokenContract = await lendingContractInstance.tokenContract.call();
    const account1 = accounts[0]; // lender and contract creator
    const account2 = accounts[1]; // borrower

    // Basic sanity checks
		assert.equal(lender.valueOf(), account1, "Lender is incorrect");
		assert.equal(borrower.valueOf(), account2, "Borrower is incorrect");
		assert.equal(rate.valueOf(), 3170979198, "Rate is incorrect");
		assert.equal(tokenContract.valueOf(), metaCoinInstance.address, "Token contract is incorrect");
    assert.equal((await lendingContractInstance.currentStage.call()).valueOf(), '1', "contract stage not waiting for tokens"); // would probably be smarter to make a corresponding enum here too but ehh

    // Giving the test subject some tokens, making sure test metacoin works
    await metaCoinInstance.transfer(account2, '100000000000000000000', { from: account1 }); // spread the wealth, we'll need a bit extra as dust accumulates
		assert.equal((await metaCoinInstance.balanceOf.call(account2)).valueOf(), '100000000000000000000', "Giveth bad amount");
    assert.equal((await metaCoinInstance.balanceOf.call(account1)).valueOf(), '900000000000000000000', "Remainth bad amount");
    
    // Depositing tokens into the lending contract
    await metaCoinInstance.approve(lendingContractInstance.address, '200000000000000000000', { from: account1 });
    await lendingContractInstance.depositTokens('200000000000000000000', { from: account1 });
    assert.equal((await metaCoinInstance.balanceOf.call(account1)).valueOf(), '700000000000000000000', "Depositing tokens didn't work (token contract)");
    assert.equal((await lendingContractInstance.tokensDeposited.call()).valueOf(), '200000000000000000000', "Depositing tokens didn't work (lending contract)");
    assert.equal((await lendingContractInstance.currentStage.call()).valueOf(), '2', "contract stage not waiting for collateral");
    
    // Update price, normal
    await priceUpdaterInstance.updatePriceTest('3798500', { from: account1 }); // 0.00379850 ETH per LINK // 3798500 in gwei
    assert.equal((await priceUpdaterInstance.getPrice.call()).valueOf(), '3798500', "Price update didn't work (price updating contract)");
    
    let account2_ethPreSign = await web3.eth.getBalance(account2);

    // Deposit collateral, about 250%, sign contract
    await lendingContractInstance.sign({ from: account2, value: toWei(1.9) });
    assert.equal((await lendingContractInstance.collateralDeposited.call()).valueOf(), toWei(1.9), "contract collateral wrong");
    assert.equal((await lendingContractInstance.getLiquidationDanger.call()).valueOf(), false, "In liquidation danger when shouldn't be! (300%)");
    assert.equal((await lendingContractInstance.currentStage.call()).valueOf(), '3', "contract stage not working");
    assert.equal((await metaCoinInstance.balanceOf.call(account2)).valueOf(), '300000000000000000000', "Loaned tokens didn't pass (token contract)");

    await sleep(3); // sleep for 3 secs, this accumulates fees

    // Update price to 155% collateral, make sure values make sense
    await priceUpdaterInstance.updatePriceTest('6120000', { from: account2 }); // 0.00612000 -> 6120000
    assert.equal((await priceUpdaterInstance.getPrice.call()).valueOf(), '6120000', "Price update didn't work (price updating contract)");
    assert.equal((await lendingContractInstance.getLiquidationDanger.call()).valueOf(), false, "In liquidation danger when shouldn't be! (155%)");

    let pretendTransactionCosts = toWei(0.05); // not accurate, but simpler than counting gas costs
    let timeDifference = Number.parseInt((new Date().getTime()/1000).toFixed(0)) - Number.parseInt((await lendingContractInstance.signingTime.call()).toString());
    timeDifference += 5; // Add some execution room
    let feesToPay = Number.parseInt((await lendingContractInstance.getDebtPerTime.call()).toString()) * timeDifference;
    await metaCoinInstance.approve(lendingContractInstance.address, new BN('200000000000000000000').add(new BN(''+feesToPay)).toString(), { from: account2 });
    await lendingContractInstance.returnCollateral(false, { from: account2 });

    let feesLeftOver = Number.parseInt((await metaCoinInstance.allowance.call(account2, lendingContractInstance.address)).toString());
    await metaCoinInstance.approve(lendingContractInstance.address, '0', { from: account2 }); // remove any leftover approval

    let feesActuallyPaid = feesToPay - feesLeftOver;
    assert.equal((await metaCoinInstance.balanceOf.call(account2)).toString(), (new BN('100000000000000000000').sub(new BN(''+feesActuallyPaid))).toString(), "Returning tokens didn't work (token contract)");
    assert.equal((await metaCoinInstance.balanceOf.call(account1)).toString(), (new BN('900000000000000000000').add(new BN(''+feesActuallyPaid))).toString(), "Returning tokens didn't work (token contract)");

    let account2_ethPostReturn = await web3.eth.getBalance(account2);
    assert.isAbove(Number.parseInt(new BN(account2_ethPostReturn).add(new BN(pretendTransactionCosts)).sub(new BN(account2_ethPreSign)).toString()), 0, "not all ETH was returned!");
  });
});

contract('LendingContract', (accounts) => {
  it('proper flow - panic liquidate', async () => {
    const metaCoinInstance = await MetaCoin.deployed();
    const lendingContractInstance = await LendingContract.deployed();
    const priceUpdater = await lendingContractInstance.priceUpdater.call();
    const priceUpdaterInstance = await PriceUpdaterTest.at(priceUpdater);
		const lender = await lendingContractInstance.lender.call();
		const borrower = await lendingContractInstance.borrower.call();
		const rate = await lendingContractInstance.rate.call();
    const tokenContract = await lendingContractInstance.tokenContract.call();
    const account1 = accounts[0]; // lender and contract creator
    const account2 = accounts[1]; // borrower
    
    // Basic sanity checks
		assert.equal(lender.valueOf(), account1, "Lender is incorrect");
		assert.equal(borrower.valueOf(), account2, "Borrower is incorrect");
		assert.equal(rate.valueOf(), 3170979198, "Rate is incorrect");
		assert.equal(tokenContract.valueOf(), metaCoinInstance.address, "Token contract is incorrect");
    assert.equal((await lendingContractInstance.currentStage.call()).valueOf(), '1', "contract stage not waiting for tokens"); 

    // Giving the test subject some tokens, making sure test metacoin works
    await metaCoinInstance.transfer(account2, '100000000000000000000', { from: account1 }); // spread the wealth, we'll need a bit extra as fee dust accumulates
		assert.equal((await metaCoinInstance.balanceOf.call(account2)).valueOf(), '100000000000000000000', "Giveth bad amount");
    assert.equal((await metaCoinInstance.balanceOf.call(account1)).valueOf(), '900000000000000000000', "Remainth bad amount");
    
    // Depositing tokens into the lending contract
    await metaCoinInstance.approve(lendingContractInstance.address, '200000000000000000000', { from: account1 });
    await lendingContractInstance.depositTokens('200000000000000000000', { from: account1 });
    assert.equal((await metaCoinInstance.balanceOf.call(account1)).valueOf(), '700000000000000000000', "Depositing tokens didn't work (token contract)");
    assert.equal((await lendingContractInstance.tokensDeposited.call()).valueOf(), '200000000000000000000', "Depositing tokens didn't work (lending contract)");
    assert.equal((await lendingContractInstance.currentStage.call()).valueOf(), '2', "contract stage not waiting for collateral");
    
    // Update price, normal
    await priceUpdaterInstance.updatePriceTest('3798500', { from: account1 }); // 0.00379850 ETH per LINK // 3798500 in gwei
    assert.equal((await priceUpdaterInstance.getPrice.call()).valueOf(), '3798500', "Price update didn't work (price updating contract)");
    
    // grab account 2 balance eth pre sign
    let account1_ethPreSign = await web3.eth.getBalance(account1);
    let account2_ethPreSign = await web3.eth.getBalance(account2);
    let signedAmount = toWei(1.9);

    // Deposit collateral, about 250%, sign contract
    await lendingContractInstance.sign({ from: account2, value: signedAmount });
    assert.equal((await lendingContractInstance.collateralDeposited.call()).valueOf(), signedAmount, "contract collateral wrong");
    assert.equal((await lendingContractInstance.getLiquidationDanger.call()).valueOf(), false, "In liquidation danger when shouldn't be! (300%)");
    assert.equal((await lendingContractInstance.currentStage.call()).valueOf(), '3', "contract stage not working");
    assert.equal((await metaCoinInstance.balanceOf.call(account2)).valueOf(), '300000000000000000000', "Loaned tokens didn't pass (token contract)");

    // Update price to 125%, make sure the liquidation makes sense 
    await priceUpdaterInstance.updatePriceTest('7600000', { from: account2 }); // anyone can initiate update price
    assert.equal((await priceUpdaterInstance.getPrice.call()).valueOf(), '7600000', "Price update didn't work (price updating contract)");
    assert.equal((await lendingContractInstance.getLiquidationDanger.call()).valueOf(), true, "NOT In liquidation danger when should be! (125%)");

    // balances post sign
    let account1_ethPostSign = await web3.eth.getBalance(account1);
    let account2_ethPostSign = await web3.eth.getBalance(account2);

    await lendingContractInstance.liquidatePanic(false, { from: account1 });
    
    // balances post sign
    let account1_ethPostReturn = await web3.eth.getBalance(account1); // should be above postSign, but smaller than postSign + signedAmount - fees
    let account2_ethPostReturn = await web3.eth.getBalance(account2); // should be above postSign, but smaller than preSign - fees
    let pretendTransactionCosts = toWei(0.05);

    assert.equal(nBN(account1_ethPostReturn).gt(nBN(account1_ethPostSign)) && 
      nBN(account1_ethPostReturn).lt(nBN(account1_ethPostSign).add(nBN(signedAmount)).sub(nBN(pretendTransactionCosts))), true, "Account 1 (lender) bad ending eth balance");
    assert.equal(nBN(account2_ethPostReturn).gt(nBN(account2_ethPostSign)) && 
      nBN(account2_ethPostReturn).lt(nBN(account2_ethPreSign).sub(nBN(pretendTransactionCosts))), true, "Account 2 (borrower) bad ending eth balance");
  });
});

contract('LendingContract', (accounts) => {
  it('proper flow - panic liquidate (when lender is completely screwed)', async () => {
    const metaCoinInstance = await MetaCoin.deployed();
    const lendingContractInstance = await LendingContract.deployed();
    const priceUpdater = await lendingContractInstance.priceUpdater.call();
    const priceUpdaterInstance = await PriceUpdaterTest.at(priceUpdater);
		const lender = await lendingContractInstance.lender.call();
		const borrower = await lendingContractInstance.borrower.call();
		const rate = await lendingContractInstance.rate.call();
    const tokenContract = await lendingContractInstance.tokenContract.call();
    const account1 = accounts[0]; // lender and contract creator
    const account2 = accounts[1]; // borrower
    
    // Basic sanity checks
		assert.equal(lender.valueOf(), account1, "Lender is incorrect");
		assert.equal(borrower.valueOf(), account2, "Borrower is incorrect");
		assert.equal(rate.valueOf(), 3170979198, "Rate is incorrect");
		assert.equal(tokenContract.valueOf(), metaCoinInstance.address, "Token contract is incorrect");
    assert.equal((await lendingContractInstance.currentStage.call()).valueOf(), '1', "contract stage not waiting for tokens"); 

    // Giving the test subject some tokens, making sure test metacoin works
    await metaCoinInstance.transfer(account2, '100000000000000000000', { from: account1 }); // spread the wealth, we'll need a bit extra as fee dust accumulates
		assert.equal((await metaCoinInstance.balanceOf.call(account2)).valueOf(), '100000000000000000000', "Giveth bad amount");
    assert.equal((await metaCoinInstance.balanceOf.call(account1)).valueOf(), '900000000000000000000', "Remainth bad amount");
    
    // Depositing tokens into the lending contract
    await metaCoinInstance.approve(lendingContractInstance.address, '200000000000000000000', { from: account1 });
    await lendingContractInstance.depositTokens('200000000000000000000', { from: account1 });
    assert.equal((await metaCoinInstance.balanceOf.call(account1)).valueOf(), '700000000000000000000', "Depositing tokens didn't work (token contract)");
    assert.equal((await lendingContractInstance.tokensDeposited.call()).valueOf(), '200000000000000000000', "Depositing tokens didn't work (lending contract)");
    assert.equal((await lendingContractInstance.currentStage.call()).valueOf(), '2', "contract stage not waiting for collateral");
    
    // Update price, normal
    await priceUpdaterInstance.updatePriceTest('3798500', { from: account1 }); // 0.00379850 ETH per LINK // 3798500 in gwei
    assert.equal((await priceUpdaterInstance.getPrice.call()).valueOf(), '3798500', "Price update didn't work (price updating contract)");
    let signedAmount = toWei(1.9);
    
    // Deposit collateral, about 250%, sign contract
    await lendingContractInstance.sign({ from: account2, value: signedAmount });
    assert.equal((await lendingContractInstance.collateralDeposited.call()).valueOf(), signedAmount, "contract collateral wrong");
    assert.equal((await lendingContractInstance.getLiquidationDanger.call()).valueOf(), false, "In liquidation danger when shouldn't be! (300%)");
    assert.equal((await lendingContractInstance.currentStage.call()).valueOf(), '3', "contract stage not working");
    assert.equal((await metaCoinInstance.balanceOf.call(account2)).valueOf(), '300000000000000000000', "Loaned tokens didn't pass (token contract)");

    // Update price to 10%, make sure the liquidation makes sense
    await priceUpdaterInstance.updatePriceTest('95000000', { from: account1 }); // 0.09500000 -> 95000000 in gwei
    assert.equal((await priceUpdaterInstance.getPrice.call()).valueOf(), '95000000', "Price update didn't work (price updating contract)");
    assert.equal((await lendingContractInstance.getLiquidationDanger.call()).valueOf(), true, "NOT In liquidation danger when should be! (10%)");

    // balances post sign
    let account1_ethPostSign = await web3.eth.getBalance(account1);
    let account2_ethPostSign = await web3.eth.getBalance(account2);

    await lendingContractInstance.liquidatePanic(false, { from: account1 });
    
    // balances post sign
    let account1_ethPostReturn = await web3.eth.getBalance(account1); // bigger than postSign + signedAmount - fees
    let account2_ethPostReturn = await web3.eth.getBalance(account2); // should be exactly at post sign, since borrower received nothing back
    let pretendTransactionCosts = toWei(0.05);

    assert.equal(nBN(account1_ethPostReturn).gt(nBN(account1_ethPostSign).add(nBN(signedAmount)).sub(nBN(pretendTransactionCosts))), true, "Account 1 (lender) bad ending eth balance");
    assert.equal(nBN(account2_ethPostReturn).eq(nBN(account2_ethPostSign)), true, "Account 2 (borrower) bad ending eth balance");
  });
});