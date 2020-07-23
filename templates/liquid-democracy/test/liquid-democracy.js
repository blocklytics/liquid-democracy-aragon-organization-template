const { assertRole } = require('@aragon/templates-shared/helpers/assertRole')(web3)
const { getEventArgument } = require('@aragon/test-helpers/events')
const deployDAOFactory = require('@aragon/os/scripts/deploy-daofactory')

// const { getENS, getTemplateAddress } = require('@aragon/templates-shared/lib/ens')(web3, artifacts)
const { deployedAddresses } = require('@aragon/templates-shared/lib/arapp-file')(web3)
const { getInstalledApps } = require('@aragon/templates-shared/helpers/events')(artifacts)
const { hash: namehash } = require('eth-ens-namehash')
const abi = require('web3-eth-abi')

const ACL = artifacts.require('ACL')
const Kernel = artifacts.require('Kernel')
const KernelAbi = require('../abis/Kernel.json')
const DAOFactoryAbi = require('../abis/DAOFactory.json')
const ENS = artifacts.require('ENS')
const DelegableVoting = artifacts.require('DelegableVoting')
const DelegableMiniMeTokenFactory = artifacts.require('DelegableMiniMeTokenFactory')
const LiquidDemocracyTemplate = artifacts.require('LiquidDemocracyTemplate')
const DELEGABLE_VOTING_APP_ID = '0x962d75a3fcdae15ddc7ef4fe1d96f9af72169958e9bc683aedfee5f32e7c84a5';
const DELEGABLE_TOKEN_MANAGER_APP_ID = '0x612a0e063dccdc5e9b8980e4f084f2831ce5ccd6f9aaf90da5811a18da11f0c2';

const APPS = [
  { name: 'agent', contractName: 'Agent' },
  { name: 'vault', contractName: 'Vault' },
  { name: 'voting', contractName: 'Voting' },
  { name: 'survey', contractName: 'Survey' },
  { name: 'payroll', contractName: 'Payroll' },
  { name: 'finance', contractName: 'Finance' },
  { name: 'token-manager', contractName: 'TokenManager' },
  { name: 'delegable-voting', contractName: 'DelegableVoting' },
  { name: 'delegable-token-manager', contractName: 'DelegableTokenManager' },
]

const APP_IDS = APPS.reduce((ids, { name }) => {
  if(name == 'delegable-voting' || name == 'delegable-token-manager') {
    ids[name] = namehash(`${name}.open.aragonpm.eth`)
  } else {
    ids[name] = namehash(`${name}.aragonpm.eth`)
  }
  return ids
}, {})


function getInstalledAppsById(receipt) {
  return Object.keys(APP_IDS).reduce((apps, appName) => {
    apps[appName] = getInstalledApps(receipt, APP_IDS[appName])
    return apps
  }, {})
}

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

contract('LiquidDemocracyTemplate', ([_, owner, tokenAddress, authorized, mgmtHolder1, mgmtHolder2, mgmtHolder3, dept1Holder1, dept1Holder2, dept2Holder1, dept2Holder2, dept2Holder3]) => {
  let ldTemplate, dao, acl, receipt, CREATE_VOTES_ROLE

  const SUPPORT = 50e16
  const ACCEPTANCE = 20e16
  const VOTING_DURATION = 60
  const VOTING_SETTINGS = [SUPPORT, ACCEPTANCE, VOTING_DURATION]
  
  const MGMT_TOKEN_NAME = 'Management Token'
  const MGMT_TOKEN_SYMBOL = 'MGMT'
  const MGMT_TOKEN_DECIMALS = 18
  const MGMT_MEMBERS = [mgmtHolder1, mgmtHolder2, mgmtHolder3]

  const DEPT1_TOKEN_NAME = 'Department 1 Token'
  const DEPT1_TOKEN_SYMBOL = 'DEPT1'
  const DEPT1_TOKEN_DECIMALS = 18
  const DEPT1_MEMBERS = [dept1Holder1, dept1Holder2]

  const DEPT2_TOKEN_NAME = 'Department 2 Token'
  const DEPT2_TOKEN_SYMBOL = 'DEPT2'
  const DEPT2_TOKEN_DECIMALS = 18
  const DEPT2_MEMBERS = [dept2Holder1, dept2Holder2, dept2Holder3]

  before('fetch liquid democracy template', async () => {
    const { registry, address } = await deployedAddresses()
    const ensRegistry = ENS.at(registry)
    const aragonIDHash = namehash('aragonid.eth')
    const aragonId = await ensRegistry.owner(aragonIDHash)
    const { daoFactory } = await deployDAOFactory(null, { artifacts: artifacts, owner, verbose: false })
    const miniMeFactory = await DelegableMiniMeTokenFactory.new()
    ldTemplate = await LiquidDemocracyTemplate.new(daoFactory.address, registry, miniMeFactory.address, aragonId)
  })

  before('prepare liquid democracy entity', async () => {
    receipt = await ldTemplate.prepareInstance(MGMT_TOKEN_NAME, MGMT_TOKEN_SYMBOL, MGMT_TOKEN_DECIMALS, false, true, VOTING_SETTINGS, 0, { from: owner })
    let events = decodeEvents(receipt, DAOFactoryAbi, 'DeployDAO')
    dao = Kernel.at(events[0].args.dao)
    acl = ACL.at(await dao.acl())
  })

  it('sets up DAO and ACL permissions correctly', async () => {
    await assertRole(acl, dao, { address: owner }, 'APP_MANAGER_ROLE')
    await assertRole(acl, acl, { address: owner }, 'CREATE_PERMISSIONS_ROLE')
  })

  xit('installs the requested application correctly', async () => {
    const installedApps = getInstalledAppsById(receipt)
    assert.equal(installedApps['delegable-voting'].length, 1, 'should have installed 1 voting app')
    const voting = DelegableVoting.at(installedApps['delegable-voting'][0])

    assert.isTrue(await voting.hasInitialized(), 'voting not initialized')
    assert.equal((await voting.voteTime()).toString(), 60)
    assert.equal((await voting.supportRequiredPct()).toString(), 50e16)
    assert.equal((await voting.minAcceptQuorumPct()).toString(), 20e16)

    await assertRole(acl, voting, { address: owner }, 'CREATE_VOTES_ROLE', { address: authorized })
  })
})
