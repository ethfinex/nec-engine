pragma solidity ^0.4.25;

import "@openzeppelin/contracts/math/SafeMath.sol"

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

contract BurnableToken {
    function burnAndRetrieve(uint256 _tokensToBurn) public returns (bool success);
    function transferFrom(address _from, address _to, uint256 _value) public returns (bool success);
}

/// @notice Liquidity contract and token sink
contract Engine {
    using SafeMath for uint256;

    event Thaw(uint amount);
    event Burn(uint amount);
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

    constructor(uint _delay, address _token) public {
        lastThaw = block.timestamp;
        thawingDelay = _delay;
        necAddress = _token;
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
        necPerEth = lastSuccessfulSale;
        liquidEther = liquidEther.add(frozenEther);
        emit Thaw(frozenEther);
        frozenEther = 0;
    }

    function percentageMultiplier() public view returns (uint) {
        uint window = (now.sub(lastThaw)).mul(35).div(thawingDelay);
        uint startingPercentage = 200;
        return (startingPercentage - (window.mul(5)));
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
        emit Burn(necAmount);
    }

    /// @dev Get NEC token
    function necToken()
        public
        view
        returns (BurnableToken)
    {
        return BurnableToken(necAddress);
    }

}
