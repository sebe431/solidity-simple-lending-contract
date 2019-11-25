pragma solidity >=0.5.0 <0.6.0;

import "./PriceUpdaterInterface.sol";
import "https://github.com/oraclize/ethereum-api/oraclizeAPI.sol";

contract PriceUpdater is PriceUpdaterInterface, usingOraclize {
	address payable public owner;
	uint private updatedPriceTimeLast;
	uint private updatedPrice; // price in gwei

	uint private decimalReceived = 8; // points received from api
	uint private decimalExpected = 9; // gwei

	constructor() public {
		owner = msg.sender;
	}

	function selfDestruct() public {
		require(msg.sender == owner);
		selfdestruct(msg.sender);
	}

	function updatePrice() public {
		if (oraclize_getPrice("URL") > address(this).balance) {
		    revert("not enough balance to pay oracle");
		} else {
			oraclize_query("URL", "json(https://api.binance.com/api/v3/ticker/price?symbol=LINKETH).price"); // If there is no price, it'll return nothing, an empty string
		}
	}
	
	function getPrice() public view returns(uint priceInGwei) {
		return updatedPrice; // If there are issues with an oracle response not having enough gas, you can techincally move the parsing mechanism here
	}

	function getPriceUpdateTime() public view returns(uint timeInSeconds) {
		return updatedPriceTimeLast;
	}

	/*
	----------------------------------------
	*/
	function() external payable {
	    // So you can load up the address for oraclizeit fees
	}

	function __callback(bytes32 myid, string memory result) public { // example string: 0.00412632 -> 4126320 (price in gwei)
		if (msg.sender != oraclize_cbAddress()) revert();

		// Parse into price in gwei
		updatedPrice = stringToUint(result) * (10 ** (decimalExpected - decimalReceived));
		updatedPriceTimeLast = now;
	}

	// Adjusted this <https://ethereum.stackexchange.com/questions/10932/how-to-convert-string-to-int> to >=0.5.0
	function stringToUint(string memory s) pure internal returns (uint val) {
        bytes memory b = bytes(s);
        uint result = 0;
        
        for (uint i = 0; i < b.length; i++) {
            uint8 bi = uint8(b[i]); // uint8 is the same size as bytes1, other types won't work
			
            if (bi >= 48 && bi <= 57) {
                result = result * 10 + (bi - 48);
            }
        }
        
        return result;
    }
}