pragma solidity >=0.5.0 <0.6.0;

/*
License (MIT) reminder:
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Contract:
This is a very thin lending contract, without any additional features, it allows a party to let another party borrow tokens, with liquidation capabilities.
It was created mostly for learning and fun but also as I couldn't find something as simple as this, this theoretically answers the question "How do I short [token that isn't on a margin platform]". 
With the license extract above in mind, this contract was tested to some extent, but is not audited by any 3rd party, and most likely has something wrong with it.
The contract was tested with 18 decimals tokens ONLY, which is most of them but not all.
It IS NOT meant to be used "as is", in its default state the price updater is manually updated for automated testing purposes, a price updater using oraclize is provided alongside it but requires you to
change manually the imported contract file.
*/

import "./ERC20Interface.sol";
import "./PriceUpdaterInterface.sol";
import "./PriceUpdaterTest.sol";

contract LendingContract {
	address payable			public lender;
	address payable			public borrower;
	uint 					public rate; // per second, so 5% annual would be ~1584404390, 10% is ~3170979198, so on, assuming 100% per sec is 10**18. So to get fees, ((sum of link) * rate / size) * seconds_since_borrow
	ERC20Interface 			public tokenContract;
	PriceUpdaterInterface	public priceUpdater;

	uint public tokensDeposited = 0;
	uint public collateralDeposited = 0;
	uint public signingTime = 0;

	enum Stage { created, waitingForTokens, waitingForCollateral, working, finished }
	Stage public currentStage = Stage.created;

	uint private size = 1000000000000000000; // 1 ether // 10**18
	uint private tokenSize = 1000000000000000000; // 1 ether // 10**18 // represents the token's decimal, NOTE: Only tested with 18 decimal tokens
	uint private priceSize = 1000000000; // 1 gwei in wei
	uint private maxTimeFromUpdate = 60*5; // 5 minutes in seconds

	/*
	----------------------------------------
	- Modifiers
	----------------------------------------
	*/
	modifier onlyStage(Stage stage) {
		require(currentStage == stage, "Wrong stage");
		_;
	}

	modifier onlyBy(address account) {
        require(msg.sender == account, "TX sent by wrong account");
        _;
    }

	modifier onlyWhenRecentlyUpdated() {
		require(now - maxTimeFromUpdate < priceUpdater.getPriceUpdateTime(), "Price was not updated recently");
		_;
	}

	modifier onlyWhenPriceUnderLiquidation() {
		require(getLiquidationDanger(), "Collateral not in danger of liquidation");
		_;
	}

	/*
	----------------------------------------
	- View functions
	----------------------------------------
	*/
	function getLoanTime() public view returns (uint val) {
		return (now - signingTime);
	}

	function getDebtPerTime() public view returns (uint val) {
		return ((tokensDeposited) * rate / size);
	}

	function getRemainingFees() public view returns (uint val) {
		return getDebtPerTime() * getLoanTime();
	}

	function getTotalDebt() public view returns (uint val) {
		return tokensDeposited + getRemainingFees();
	}

	function getLiquidationDanger() public view returns (bool success) {
		return getLiquidationDanger(collateralDeposited, priceUpdater.getPrice(), getTotalDebt());
	}

	function getLiquidationDanger(uint _collateral, uint _price, uint _tokens) public view returns (bool success) {
		return (_collateral / _price) < ((_tokens * 150) / 100 * priceSize) / tokenSize;
	}
	
	/*
	----------------------------------------
	- Stages created -> working
	----------------------------------------
	*/
	constructor(address payable _lender, address payable _borrower, uint _rate, address _tokenContractAddress) public {
		lender = _lender;
		borrower = _borrower;
		rate = _rate;
		tokenContract = ERC20Interface(_tokenContractAddress); //0x20fE562d797A42Dcb3399062AE9546cd06f63280); - Ropsten chainlink token contract
		priceUpdater = new PriceUpdater();
		currentStage = Stage.waitingForTokens;
	}

	function depositTokens(uint sum) public onlyBy(lender) onlyStage(Stage.waitingForTokens) {
		tokensDeposited = sum;
		currentStage = Stage.waitingForCollateral;

		if(tokenContract.transferFrom(msg.sender, address(this), sum) == false) {
			revert("Not enough allowance to amount to the sum specified");
		}
	}

	function sign() public payable onlyBy(borrower) onlyWhenRecentlyUpdated() onlyStage(Stage.waitingForCollateral) {
		require(getLiquidationDanger(msg.value, priceUpdater.getPrice(), tokensDeposited) == false, "Amount of collateral sent does not amount to over 150% collateral");
		collateralDeposited = msg.value;
		signingTime = now;
		currentStage = Stage.working;

		if(tokenContract.transfer(msg.sender, tokensDeposited) == false) {
			revert("Unable to transfer collateral backed tokens");
		}
	}

	/*
	----------------------------------------
	- Contract finishing functions
	----------------------------------------
	*/
	function withdrawTokensPrematurely(bool selfDestructConfirm) public onlyBy(lender) onlyStage(Stage.waitingForCollateral) {
		uint tokensDepositedTemp = tokensDeposited;

		collateralDeposited = 0;
		tokensDeposited = 0;
		currentStage = Stage.finished;

		if(tokenContract.transfer(lender, tokensDepositedTemp) == false) {
			revert("Unable to withdraw tokens");
		}
		
		selfDestruct(selfDestructConfirm);
	}

	function liquidatePanic(bool selfDestructConfirm) public onlyBy(lender) onlyWhenRecentlyUpdated() onlyWhenPriceUnderLiquidation() onlyStage(Stage.working) {
		uint depositToLender = (((tokensDeposited * (priceUpdater.getPrice() * priceSize)) * 110) / 100) / tokenSize;
		uint depositToBorrower = collateralDeposited - depositToLender;

		// If there isn't even 110% collateral available
		if(depositToLender > collateralDeposited) {
			depositToLender = collateralDeposited;
			depositToBorrower = 0;
		}

		collateralDeposited = 0;
		tokensDeposited = 0;
		currentStage = Stage.finished;

		if(depositToBorrower > 0) {
			borrower.transfer(depositToBorrower);
		}

		lender.transfer(depositToLender);

		selfDestruct(selfDestructConfirm);
	}

	function returnCollateral(bool selfDestructConfirm) public onlyBy(borrower) onlyStage(Stage.working) {
		uint collateralDepositedTemp = collateralDeposited;
		uint tokensDepositedTemp = getTotalDebt();

		collateralDeposited = 0;
		tokensDeposited = 0;
		currentStage = Stage.finished;

		// Receive the tokens back
		if(tokenContract.transferFrom(msg.sender, address(this), tokensDepositedTemp) == false) {
			revert("Not enough token allowance to cover total debt");
		}

		// Send the tokens further down the line to the original lender
		if(tokenContract.transfer(lender, tokensDepositedTemp) == false) {
			revert("Unable to transfer tokens forward to lender");
		}

		// Return all of the collateral to the borrower
		borrower.transfer(collateralDepositedTemp);

		selfDestruct(selfDestructConfirm);
	}

	function selfDestruct(bool confirm) private onlyStage(Stage.finished) {
		if(confirm) {
			priceUpdater.selfDestruct();
			selfdestruct(msg.sender);
		}
	}
}
