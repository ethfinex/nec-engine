pragma solidity ^0.5.0;

import "@openzeppelin/contracts/math/SafeMath.sol";

// Loosely inspired by Melon Protocol Engine

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

// TODO: add events for purchase/burn
// TODO: track total burned by period
// TODO: track total ether consumed over time
// TODO: return next auction start time, check UI for other stats required.
// Return next price change and time


contract BurnableToken {
    function burnAndRetrieve(uint256 _tokensToBurn) public returns (bool success);
    function transferFrom(address _from, address _to, uint256 _value) public returns (bool success);
}

/// @notice NEC Auction Engine
contract Engine {
    using SafeMath for uint256;

    event Thaw(uint amount);
    event Burn(uint amount, uint price);
    event FeesPaid(uint amount);

    uint public constant NEC_DECIMALS = 18;
    address public necAddress;

    uint public frozenEther;
    uint public liquidEther;
    uint public lastThaw;
    uint public thawingDelay;
    uint public totalEtherConsumed;
    uint public totalNecBurned;

    uint private necPerEth; // Price at which the previous auction ended
    uint private lastSuccessfulSale;

    // Params for auction price multiplier - can make customizable with an admin function
    uint private startingPercentage = 200;
    uint private numberSteps = 35;

    constructor(uint _delay, address _token) public {
        lastThaw = block.timestamp;
        thawingDelay = _delay;
        necAddress = _token;
        necPerEth = 1000;
    }

    function payFeesInEther() external payable {
        totalEtherConsumed = totalEtherConsumed.add(msg.value);
        frozenEther = frozenEther.add(msg.value);
        emit FeesPaid(msg.value);
    }

    /// @notice Move frozen ether to liquid pool after delay
    /// @dev Delay only restarts when this function is called
    function thaw() external {
        require(
            block.timestamp >= lastThaw.add(thawingDelay),
            "Thawing delay has not passed"
        );
        require(frozenEther > 0, "No frozen ether to thaw");
        lastThaw = block.timestamp;
        if (lastSuccessfulSale > 0) {
          necPerEth = lastSuccessfulSale;
        } else {
          necPerEth = necPerEth.div(4);
        }
        liquidEther = liquidEther.add(frozenEther);
        emit Thaw(frozenEther);
        frozenEther = 0;
    }

    function getPriceWindow() public view returns (uint window) {
      window = (now.sub(lastThaw)).mul(numberSteps).div(thawingDelay);
    }

    function percentageMultiplier() public view returns (uint) {
        return (startingPercentage.sub(getPriceWindow().mul(5)));
    }

    /// @return NEC per ETH including premium
    function enginePrice() public view returns (uint) {
        return necPerEth.mul(percentageMultiplier()).div(100);
    }

    function ethPayoutForNecAmount(uint necAmount) public view returns (uint) {
        return necAmount.mul(enginePrice()).div(10 ** uint(NEC_DECIMALS));
    }

    /// @notice NEC must be approved first
    function sellAndBurnNec(uint necAmount) external {
        require(
            necToken().transferFrom(msg.sender, address(this), necAmount),
            "NEC transferFrom failed"
        );
        uint ethToSend = ethPayoutForNecAmount(necAmount);
        lastSuccessfulSale = enginePrice();
        require(ethToSend > 0, "No ether to pay out");
        require(liquidEther >= ethToSend, "Not enough liquid ether to send");
        liquidEther = liquidEther.sub(ethToSend);
        totalNecBurned = totalNecBurned.add(necAmount);
        msg.sender.transfer(ethToSend);
        necToken().burnAndRetrieve(necAmount);
        emit Burn(necAmount, lastSuccessfulSale);
    }

    /// @dev Get NEC token
    function necToken()
        public
        view
        returns (BurnableToken)
    {
        return BurnableToken(necAddress);
    }



    /// Useful read functions for UI
    function getNextPriceChange() public view returns (
        uint newPrice,
        uint nextChangeTimeSeconds )
    {
      uint nextWindow = getPriceWindow() + 1;
      nextChangeTimeSeconds = lastThaw + thawingDelay.mul(nextWindow).div(numberSteps);
      newPrice = (startingPercentage.sub(nextWindow.mul(5)));
    }

    function getNextAuction() public view returns (
        uint nextStartTimeSeconds,
        uint ethAvailable,
        uint startingPrice
        ) {

    }

    function getEthAuctioned(uint auctionNumber) public view returns (uint) {

    }

    function getNecBurned(uint auctionNumber) public view returns (uint) {

    }


}
