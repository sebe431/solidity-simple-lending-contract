pragma solidity >=0.5.0 <0.6.0;

import "./PriceUpdaterInterface.sol";

contract PriceUpdater is PriceUpdaterInterface {
	address payable public owner;
	uint public updatedPriceTimeLast;
	uint public updatedPrice; // price in gwei

	//uint public decimalReceived = 8; // These aren't needed here
	//uint public decimalExpected = 9;

	constructor() public {
		owner = msg.sender;
	}
	
	function selfDestruct() public {
		require(msg.sender == owner);
		selfdestruct(msg.sender);
	}

	function updatePrice() public {
		// Here is where an external oracle does its thing, for testing purposes we'll call updatePriceTest()
	}

	function getPrice() public view returns(uint priceInGwei) {
		return updatedPrice; // If there are issues with an oracle response not having enough gas, you can techincally move the parsing mechanism here
	}

	function getPriceUpdateTime() public view returns(uint timeInSeconds) {
		return updatedPriceTimeLast;
	}

	function updatePriceTest(uint newPrice) public {
		updatePriceFinalize(newPrice);	
	}

	// This is a test replacement to a real oracle
	function updatePriceFinalize(uint newPrice) public {
		updatedPrice = newPrice;
		updatedPriceTimeLast = now;
	}
}