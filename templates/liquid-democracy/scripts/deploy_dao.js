const Template = artifacts.require('LiquidDemocracyTemplate')

const abi = require('web3-eth-abi')
const DAOFactoryAbi = require('../abis/DAOFactory.json')

const decodeEvents = ({
  receipt
}, contractAbi, eventName) => {
  const eventAbi = contractAbi.filter(abi => abi.name === eventName && abi.type === 'event')[0]
  const eventSignature = abi.encodeEventSignature(eventAbi)
  const eventLogs = receipt.logs.filter(l => l.topics[0] === eventSignature)
  return eventLogs.map(log => {
    log.event = eventAbi.name
    log.args = abi.decodeLog(eventAbi.inputs, log.data, log.topics.slice(1))
    return log
  })
}

const DAYS = 24 * 3600
const WEEKS = 7 * DAYS

const MGMT = {
  "name": "Executive",
  "symbol": "EXEC",
  "decimals": 18,
  "members": ['0x27644a3F5D51dEA8705DC7FB1CD67100D73273B1', '0xa52422BB8c29E4d55243d310fB6BAe793162452e', '0xFd90411B0c246743aE0000BB18c723A3BB909Dee'],
  "stakes": [100000e18, 100000e18, 100000e18],
  "transferable": false,
  "delegable": true
}

const DEPARTMENTS = [{
    "name": "Department of the Interior",
    "symbol": "INT",
    "decimals": 18,
    "members": ['0x27644a3F5D51dEA8705DC7FB1CD67100D73273B1', '0xa52422BB8c29E4d55243d310fB6BAe793162452e', '0x04EcEB77965BB426C54EE70d7fcEB2a9bDBdAfed'],
    "stakes": [100000e18, 100000e18, 100000e18],
    "transferable": false,
    "delegable": true
  },
  {
    "name": "Department of Education",
    "symbol": "EDU",
    "decimals": 18,
    "members": ['0xFd90411B0c246743aE0000BB18c723A3BB909Dee', '0xa52422BB8c29E4d55243d310fB6BAe793162452e', '0x04EcEB77965BB426C54EE70d7fcEB2a9bDBdAfed', '0x27644a3F5D51dEA8705DC7FB1CD67100D73273B1'],
    "stakes": [100000e18, 100000e18, 100000e18, 100000e18],
    "transferable": false,
    "delegable": true
  },
  {
    "name": "Department of Defense",
    "symbol": "DOD",
    "decimals": 18,
    "members": ['0xFd90411B0c246743aE0000BB18c723A3BB909Dee', '0x99d0cc84a9b00bbB596463a415631886b02a9a70', '0x27644a3F5D51dEA8705DC7FB1CD67100D73273B1'],
    "stakes": [100000e18, 100000e18, 100000e18],
    "transferable": false,
    "delegable": true
  },
  {
    "name": "Environmental Protection Agency",
    "symbol": "EPA",
    "decimals": 18,
    "members": ['0x2B7cFb1aA760d5050F5096d8fa123980Cb874EcC', '0x04EcEB77965BB426C54EE70d7fcEB2a9bDBdAfed', '0x27644a3F5D51dEA8705DC7FB1CD67100D73273B1', '0xa52422BB8c29E4d55243d310fB6BAe793162452e'],
    "stakes": [100000e18, 100000e18, 100000e18, 100000e18],
    "transferable": false,
    "delegable": true
  }
]

const MGMT_VOTE_DURATION = WEEKS
const MGMT_SUPPORT_REQUIRED = 50e16
const MGMT_MIN_ACCEPTANCE_QUORUM = 40e16
const MGMT_VOTING_SETTINGS = [MGMT_SUPPORT_REQUIRED, MGMT_MIN_ACCEPTANCE_QUORUM, MGMT_VOTE_DURATION]

const DEPT_VOTE_DURATION = WEEKS
const DEPT_SUPPORT_REQUIRED = 50e16
const DEPT_MIN_ACCEPTANCE_QUORUM = 5e16
const DEPT_VOTING_SETTINGS = [DEPT_SUPPORT_REQUIRED, DEPT_MIN_ACCEPTANCE_QUORUM, DEPT_VOTE_DURATION]

// const ID = 'liquid-democracy' + Math.random()
const ID = 'usa-federal-government'

module.exports = async callback => {
  try {
    const template = await Template.at(process.argv[6])

    const receipt = await template.prepareInstance(MGMT.name, MGMT.symbol, MGMT.decimals, MGMT.transferable, MGMT.delegable, MGMT_VOTING_SETTINGS, 0, {
      gasPrice: 60000000001
    })
    for(let i = 0; i < DEPARTMENTS.length; i++) {
      await template.installDepartment(DEPARTMENTS[i].name, DEPARTMENTS[i].symbol, DEPARTMENTS[i].decimals, DEPARTMENTS[i].transferable, DEPARTMENTS[i].delegable, DEPT_VOTING_SETTINGS, 0, {
        gasPrice: 60000000001
      })
      await template.distributeDepartmentTokens(DEPARTMENTS[i].members, DEPARTMENTS[i].stakes, {
        gasPrice: 60000000001
      })
    }
      
    await template.finalizeInstance(ID, MGMT.members, MGMT.stakes, 0, true, {
      gasPrice: 60000000001
    })
    let events = decodeEvents(receipt, DAOFactoryAbi, 'DeployDAO')
    const dao = events[0].args.dao
    console.log('DAO deployed at ' + dao)
  } catch (err) {
    console.log(err)
  }

  callback()
}