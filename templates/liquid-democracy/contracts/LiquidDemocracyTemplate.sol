pragma solidity 0.4.24;

import "./BaseTemplate.sol";
import "./DelegableVoting.sol";
import "./DelegableMiniMeToken.sol";
import "./DelegableTokenManager.sol";

contract LiquidDemocracyTemplate is BaseTemplate {
    string constant private ERROR_MISSING_CACHE = "LD_MISSING_CACHE";
    string constant private ERROR_BAD_ARRAY_LEN = "LD_ARRAYS_MUST_BE_SAME_LENGTH";

    uint64 constant private DEFAULT_FINANCE_PERIOD = uint64(30 days);

    struct Cache {
        address dao;
        address mgmtTokenManager;
        address mgmtVotingApp;
        address deptTokenManager;
        address deptVotingApp;
    }

    mapping (address => Cache) internal cache;

    event DepartmentCreated(address org, address department, address tokenManager, address token, bool isMgmt);

    constructor(DAOFactory _daoFactory, ENS _ens, DelegableMiniMeTokenFactory _miniMeFactory, IFIFSResolvingRegistrar _aragonID)
        BaseTemplate(_daoFactory, _ens, _miniMeFactory, _aragonID)
        public
    {
        _ensureAragonIdIsValid(_aragonID);
        _ensureMiniMeFactoryIsValid(_miniMeFactory);
    }

    /**
    * @dev Create an incomplete Liquid Democracy DAO and cache it for later setup steps
    * @param _managementTokenName Name of management token used to govern the DAO
    * @param _managementTokenSymbol Symbol of management token used to govern the DAO
    * @param _managementTokenDecimals Decimals of management token used to govern the DAO
    * @param _managementTokensTransferable True if management tokens are transferable
    * @param _managementTokensDelegable True if management tokens are delegable
    * @param _managementVotingSettings Array of voting settings for management governance: [supportRequired, minAcceptanceQuorum, voteDuration]
    * @param _managementMaxTokens The max number of management tokens any management token holder can have
    */
    function prepareInstance(
        string _managementTokenName,
        string _managementTokenSymbol,
        uint8 _managementTokenDecimals,
        bool _managementTokensTransferable,
        bool _managementTokensDelegable,
        uint64[3] _managementVotingSettings,
        uint256 _managementMaxTokens
    )
        external
    {
        (Kernel dao, ACL acl) = _createDAO();
        DelegableMiniMeToken mgmtToken = _createToken(_managementTokenName, _managementTokenSymbol, _managementTokenDecimals, _managementTokensTransferable, _managementTokensDelegable);
        DelegableTokenManager mgmtTokenManager = _installDelegableTokenManagerApp(dao, mgmtToken, _managementTokensTransferable, _managementTokensDelegable, _managementMaxTokens);
        DelegableVoting mgmtVotingApp = _installDelegableVotingApp(dao, mgmtToken, _managementVotingSettings);
        _grantManagementPrivileges(acl, mgmtTokenManager, mgmtVotingApp);
        _cachePreparedDao(address(dao), address(mgmtTokenManager), address(mgmtVotingApp));
        DepartmentCreated(address(dao), address(mgmtVotingApp), address(mgmtTokenManager), address(mgmtToken), true);
    }

    /**
    * @dev Create an incomplete Liquid Democracy DAO and cache it for later setup steps
    * @param _tokenName String with the names of each token used by share holders in the organization
    * @param _tokenSymbol String  with the symbol for each token used by share holders in the organization
    * @param _tokenDecimals Decimals for token
    * @param _tokenTransferable True if tokens are transferable
    * @param _tokenDelegable True if tokens are delegable
    * @param _votingSettings Array of voting settings for voting governance: [supportRequired, minAcceptanceQuorum, voteDuration]
    * @param _maxTokens The max number of voting tokens any token holder can have
    */
    function installDepartment(
        string _tokenName,
        string _tokenSymbol,
        uint8 _tokenDecimals,
        bool _tokenTransferable,
        bool _tokenDelegable,
        uint64[3] _votingSettings,
        uint256 _maxTokens
    )
        external
    {
        _ensureMgmtCache();

        (Kernel dao, DelegableTokenManager mgmtTokenManager, DelegableVoting mgmtVotingApp) = _daoCache();
        DelegableMiniMeToken newToken = _createToken(_tokenName, _tokenSymbol, _tokenDecimals, _tokenTransferable, _tokenDelegable);
        DelegableTokenManager newTokenManager = _installDelegableTokenManagerApp(dao, newToken, _tokenTransferable, _tokenDelegable, _maxTokens);
        DelegableVoting newVotingApp = _installDelegableVotingApp(dao, newToken, _votingSettings);
        _createDelegableVotingPermissions(ACL(dao.acl()), newVotingApp, mgmtVotingApp, newTokenManager, mgmtVotingApp);
        _cacheDept(newTokenManager, newVotingApp);
        DepartmentCreated(address(dao), address(newVotingApp), address(newTokenManager), address(newToken), false);
    }

    /**
    * @dev Distributes tokens to the most recently cached Department
    * @param _deptTokenHolders Array of addresses of department token holders at launch
    * @param _deptStakes Array of balances of department token holders at launch
    */
    function distributeDepartmentTokens(
        address[] _deptTokenHolders,
        uint256[] _deptStakes
    )
        external
    {
        require(_deptTokenHolders.length == _deptStakes.length, ERROR_BAD_ARRAY_LEN);
        (Kernel dao, DelegableTokenManager deptTokenManager, DelegableVoting deptVotingApp, DelegableVoting mgmtVotingApp) = _popDeptCache();
        _mintTokens(ACL(dao.acl()), deptTokenManager, _deptTokenHolders, _deptStakes);
        _createTokenManagerPermissions(ACL(dao.acl()), deptTokenManager, deptVotingApp, mgmtVotingApp);
    }


    /**
    * @dev Finalize a previously prepared DAO instance cached by the user
    * @param _id String with the name for org, will assign `[id].aragonid.eth`
    * @param _managementTokenHolders Array of addresses of management token holders at launch
    * @param _managementStakes Array of balances of management token holders at launch
    * @param _financePeriod Initial duration for accounting periods, it can be set to zero in order to use the default of 30 days.
    * @param _useAgentAsVault Boolean to tell whether to use an Agent app as a more advanced form of Vault app
    */
    function finalizeInstance(
        string _id,
        address[] _managementTokenHolders,
        uint256[] _managementStakes,
        uint64 _financePeriod,
        bool _useAgentAsVault
    )
        external
    {
        _validateId(_id);
        _ensureMgmtCache();
        
        require(_managementTokenHolders.length == _managementStakes.length, ERROR_BAD_ARRAY_LEN);

        (Kernel dao, DelegableTokenManager mgmtTokenManager, DelegableVoting mgmtVotingApp) = _popDaoCache();

        Finance finance = _setupVaultAndFinanceApps(dao, _financePeriod, _useAgentAsVault, mgmtVotingApp);

        _mintTokens(ACL(dao.acl()), mgmtTokenManager, _managementTokenHolders, _managementStakes);
        _createTokenManagerPermissions(ACL(dao.acl()), mgmtTokenManager, mgmtVotingApp, mgmtVotingApp);

        _transferCreatePaymentManagerFromTemplate(ACL(dao.acl()), finance, mgmtVotingApp);
        _transferRootPermissionsFromTemplateAndFinalizeDAO(dao, mgmtVotingApp);
        _registerID(_id, address(dao));
    }

    /***** internal setup functions *****/

    function _setupVaultAndFinanceApps(
        Kernel _dao,
        uint64 _financePeriod,
        bool _useAgentAsVault,
        DelegableVoting _mgmtVoting
    )
        internal
        returns (Finance)
    {
        // Install
        Vault agentOrVault = _useAgentAsVault ? _installDefaultAgentApp(_dao) : _installVaultApp(_dao);
        Finance finance = _installFinanceApp(_dao, agentOrVault, _financePeriod == 0 ? DEFAULT_FINANCE_PERIOD : _financePeriod);

        // Assign permissions
        ACL acl = ACL(_dao.acl());
        if (_useAgentAsVault) {
            _createCustomAgentPermissions(acl, Agent(agentOrVault), _mgmtVoting);
        }
        _createVaultPermissions(acl, agentOrVault, finance, _mgmtVoting);
        _createFinancePermissions(acl, finance, _mgmtVoting, _mgmtVoting);
        _createFinanceCreatePaymentsPermission(acl, finance, _mgmtVoting, address(this));

        return finance;
    }

    /***** permissions allocation *****/

    function _grantManagementPrivileges(
        ACL _acl,
        DelegableTokenManager _mgmtTokenManager,
        DelegableVoting _mgmtVotingApp
    ) {
        _createEvmScriptsRegistryPermissions(_acl, _mgmtVotingApp, _mgmtVotingApp);
        _createDelegableVotingPermissions(_acl, _mgmtVotingApp, _mgmtVotingApp, _mgmtTokenManager, _mgmtVotingApp);
    }

    function _createCustomAgentPermissions(ACL _acl, Agent _agent, DelegableVoting _mgmtVotingApp) internal {
        _acl.createPermission(_mgmtVotingApp, _agent, _agent.EXECUTE_ROLE(), _mgmtVotingApp);
        _acl.createPermission(_mgmtVotingApp, _agent, _agent.RUN_SCRIPT_ROLE(), _mgmtVotingApp);
    }

    /***** internal cache functions *****/

    function _cachePreparedDao(
        address _dao,
        address _mgmtTokenManager,
        address _mgmtVotingApp
    )
        internal
    {
        Cache storage c = cache[msg.sender];
        c.dao = _dao;
        c.mgmtTokenManager = _mgmtTokenManager;
        c.mgmtVotingApp = _mgmtVotingApp;
    }

    function _cacheDept(
        address _deptTokenManager,
        address _deptVotingApp
    )
        internal
    {
        Cache storage c = cache[msg.sender];
        c.deptTokenManager = _deptTokenManager;
        c.deptVotingApp = _deptVotingApp;
    }

    function _daoCache() internal view returns (Kernel dao, DelegableTokenManager mgmtTokenManager, DelegableVoting mgmtVotingApp) {
        Cache storage c = cache[msg.sender];
        dao = Kernel(c.dao);
        mgmtTokenManager = DelegableTokenManager(c.mgmtTokenManager);
        mgmtVotingApp = DelegableVoting(c.mgmtVotingApp);
    }

    function _popDeptCache() internal returns (Kernel dao, DelegableTokenManager deptTokenManager, DelegableVoting deptVotingApp, DelegableVoting mgmtVotingApp) {
        Cache storage c = cache[msg.sender];
        require(c.dao != address(0) && c.deptTokenManager != address(0) && c.deptVotingApp != address(0) && c.mgmtVotingApp != address(0), ERROR_MISSING_CACHE);
        dao = Kernel(c.dao);
        deptTokenManager = DelegableTokenManager(c.deptTokenManager);
        deptVotingApp = DelegableVoting(c.deptVotingApp);
        mgmtVotingApp = DelegableVoting(c.mgmtVotingApp);
        delete c.deptTokenManager;
        delete c.deptVotingApp;
    }

    function _popDaoCache() internal returns (Kernel dao, DelegableTokenManager mgmtTokenManager, DelegableVoting mgmtVotingApp) {
        Cache storage c = cache[msg.sender];
        require(c.dao != address(0) && c.mgmtVotingApp != address(0), ERROR_MISSING_CACHE);
        
        dao = Kernel(c.dao);
        mgmtTokenManager = DelegableTokenManager(c.mgmtTokenManager);
        mgmtVotingApp = DelegableVoting(c.mgmtVotingApp);

        delete c.dao;
        delete c.mgmtTokenManager;
        delete c.mgmtVotingApp;
    }

    /***** internal check functions *****/

    function _ensureMgmtCache() internal view {
        Cache storage c = cache[msg.sender];
        require(
            c.dao != address(0) &&
            c.mgmtVotingApp != address(0) &&
            c.mgmtTokenManager != address(0)
        , ERROR_MISSING_CACHE);
    }
}
