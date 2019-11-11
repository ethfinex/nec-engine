const Engine = artifacts.require("./Engine.sol")
const NEC = artifacts.require("./SimpleNEC.sol")

module.exports = function(deployer) {

  deployer.then(async () => {

		await deployer.deploy(NEC)
		const necAddress = await NEC.deployed()
    await deployer.deploy(Engine, 1 * 60 * 60, necAddress.address)
  })

}
