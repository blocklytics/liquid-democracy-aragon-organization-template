const Template = artifacts.require('LiquidDemocracyTemplate')

const abi = require('web3-eth-abi')
const DAOFactoryAbi = require('../abis/DAOFactory.json')

const decodeEvents = ({ receipt }, contractAbi, eventName) => {
  const eventAbi = contractAbi.filter(abi => abi.name === eventName && abi.type === 'event')[0]
  const eventSignature = abi.encodeEventSignature(eventAbi)
  const eventLogs = receipt.logs.filter(l => l.topics[0] === eventSignature)
  return eventLogs.map(log => {
    log.event = eventAbi.name
    log.args = abi.decodeLog(eventAbi.inputs, log.data, log.topics.slice(1))
    console.log(log)
    return log
  })
}

const DAYS = 24 * 3600
const WEEKS = 7 * DAYS
const PPM = 1e6

const MGMT_TOKEN_NAME = 'Management Token'
const MGMT_TOKEN_SYMBOL = 'MGMT'
const MGMT_TOKEN_DECIMALS = 18
const MGMT_MEMBERS = ['0x27644a3F5D51dEA8705DC7FB1CD67100D73273B1', '0xa52422BB8c29E4d55243d310fB6BAe793162452e', '0xFd90411B0c246743aE0000BB18c723A3BB909Dee']
const MGMT_STAKES = [100000e18, 100000e18, 100000e18]

const DEPT1_TOKEN_NAME = 'Department 1 Token'
const DEPT1_TOKEN_SYMBOL = 'DEPT1'
const DEPT1_TOKEN_DECIMALS = 18
const DEPT1_MEMBERS = ['0x27644a3F5D51dEA8705DC7FB1CD67100D73273B1', '0xa52422BB8c29E4d55243d310fB6BAe793162452e', '0x04EcEB77965BB426C54EE70d7fcEB2a9bDBdAfed']

const DEPT2_TOKEN_NAME = 'Department 2 Token'
const DEPT2_TOKEN_SYMBOL = 'DEPT2'
const DEPT2_TOKEN_DECIMALS = 18
const DEPT2_MEMBERS = ['0xFd90411B0c246743aE0000BB18c723A3BB909Dee', '0xa52422BB8c29E4d55243d310fB6BAe793162452e', '0x04EcEB77965BB426C54EE70d7fcEB2a9bDBdAfed', '0x27644a3F5D51dEA8705DC7FB1CD67100D73273B1']

const MGMT_VOTE_DURATION = WEEKS
const MGMT_SUPPORT_REQUIRED = 50e16
const MGMT_MIN_ACCEPTANCE_QUORUM = 40e16
const MGMT_VOTING_SETTINGS = [MGMT_SUPPORT_REQUIRED, MGMT_MIN_ACCEPTANCE_QUORUM, MGMT_VOTE_DURATION]

const DEPT_VOTE_DURATION = WEEKS
const DEPT_SUPPORT_REQUIRED = 50e16
const DEPT_MIN_ACCEPTANCE_QUORUM = 5e16
const DEPT_VOTING_SETTINGS = [DEPT_SUPPORT_REQUIRED, DEPT_MIN_ACCEPTANCE_QUORUM, DEPT_VOTE_DURATION]

const ID = 'liquid-democracy' + Math.random()

module.exports = async callback => {
  try {
    const template = await Template.at(process.argv[6])

    const receipt = await template.prepareInstance(MGMT_TOKEN_NAME, MGMT_TOKEN_SYMBOL, MGMT_TOKEN_DECIMALS, false, true, MGMT_VOTING_SETTINGS, 0, { gasPrice: 60000000001 })
    await template.installDepartment(DEPT1_TOKEN_NAME, DEPT1_TOKEN_SYMBOL, DEPT1_TOKEN_DECIMALS, false, true, DEPT_VOTING_SETTINGS, 0, { gasPrice: 60000000001 })
    await template.installDepartment(DEPT2_TOKEN_NAME, DEPT2_TOKEN_SYMBOL, DEPT2_TOKEN_DECIMALS, true, true, DEPT_VOTING_SETTINGS, 0, { gasPrice: 60000000001 })
    await template.finalizeInstance(ID, MGMT_MEMBERS, MGMT_STAKES, 0, true, { gasPrice: 60000000001 })
    let events = decodeEvents(receipt, DAOFactoryAbi, 'DeployDAO')
    const dao = events[0].args.dao
    console.log('DAO deployed at ' + dao)
  } catch (err) {
    console.log(err)
  }

  callback()
}
