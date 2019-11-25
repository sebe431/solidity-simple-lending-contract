pragma solidity >=0.5.0 <0.6.0;

contract PriceUpdaterInterface {
	function selfDestruct() public;
	function updatePrice() public;
	function getPrice() public view returns(uint val);
	function getPriceUpdateTime() public view returns(uint val);
}