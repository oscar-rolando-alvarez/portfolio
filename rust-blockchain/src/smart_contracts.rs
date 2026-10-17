//! WebAssembly smart-contract VM built on Wasmtime.
//!
//! Gas is implemented with Wasmtime fuel. Contracts can import the following
//! host functions from the `env` module:
//!
//! * `storage_read(key: i32) -> i64` - read an integer slot (0 when unset)
//! * `storage_write(key: i32, value: i64)` - write an integer slot
//! * `emit_log(topic: i32, value: i64)` - append a log entry
//! * `debug_print(ptr: i32, len: i32)` - log a UTF-8 string from linear memory

use crate::crypto::{hash_to_string, sha256};
use crate::error::{BlockchainError, Result};
use crate::{Address, Amount, Hash};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasmtime::{Caller, Config, Engine, Extern, Linker, Module, Store, Val, ValType};

pub type Gas = u64;
pub type ContractCode = Vec<u8>;

pub const MAX_GAS_LIMIT: Gas = 10_000_000;
/// Base units charged per unit of gas.
pub const GAS_PRICE: Amount = 1;
/// Gas charged for deploying a contract without a constructor.
pub const BASE_DEPLOYMENT_GAS: Gas = 21_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartContract {
    pub address: Address,
    pub code: ContractCode,
    pub state: ContractState,
    pub owner: Address,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub gas_used: Gas,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ContractState {
    pub storage: HashMap<String, Vec<u8>>,
    pub balance: Amount,
    pub nonce: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractCall {
    pub contract_address: Address,
    pub caller: Address,
    pub function_name: String,
    pub parameters: Vec<ContractParameter>,
    pub gas_limit: Gas,
    pub value: Amount,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ContractParameter {
    U32(u32),
    U64(u64),
    String(String),
    Bytes(Vec<u8>),
    Address(Address),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractDeployment {
    pub code: ContractCode,
    pub constructor_params: Vec<ContractParameter>,
    pub deployer: Address,
    pub gas_limit: Gas,
    pub value: Amount,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub success: bool,
    pub gas_used: Gas,
    /// Little-endian encoding of the function's return values.
    pub return_data: Vec<u8>,
    pub logs: Vec<ContractLog>,
    pub error: Option<String>,
    pub state_changes: Vec<StateChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractLog {
    pub topics: Vec<Hash>,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateChange {
    pub contract_address: Address,
    pub key: String,
    pub old_value: Option<Vec<u8>>,
    pub new_value: Vec<u8>,
}

/// Per-execution host state visible to host functions.
struct HostState {
    contract_address: Address,
    storage: HashMap<String, Vec<u8>>,
    changes: Vec<StateChange>,
    logs: Vec<ContractLog>,
}

impl HostState {
    fn slot_key(key: i32) -> String {
        format!("slot:{key}")
    }

    fn read(&self, key: i32) -> i64 {
        self.storage
            .get(&Self::slot_key(key))
            .and_then(|bytes| <[u8; 8]>::try_from(bytes.as_slice()).ok())
            .map(i64::from_le_bytes)
            .unwrap_or(0)
    }

    fn write(&mut self, key: i32, value: i64) {
        let key = Self::slot_key(key);
        let new_value = value.to_le_bytes().to_vec();
        let old_value = self.storage.insert(key.clone(), new_value.clone());
        self.changes.push(StateChange {
            contract_address: self.contract_address.clone(),
            key,
            old_value,
            new_value,
        });
    }
}

#[derive(Debug)]
pub struct SmartContractVM {
    engine: Engine,
    contracts: HashMap<Address, SmartContract>,
    gas_meter: GasMeter,
    deploy_nonce: u64,
}

#[derive(Debug)]
struct GasMeter {
    gas_limit: Gas,
    gas_used: Gas,
}

impl GasMeter {
    fn new(gas_limit: Gas) -> Self {
        Self {
            gas_limit,
            gas_used: 0,
        }
    }

    fn consume_gas(&mut self, amount: Gas) -> Result<()> {
        if self.gas_used.saturating_add(amount) > self.gas_limit {
            return Err(BlockchainError::SmartContractError(
                "Out of gas".to_string(),
            ));
        }
        self.gas_used += amount;
        Ok(())
    }

    fn remaining_gas(&self) -> Gas {
        self.gas_limit.saturating_sub(self.gas_used)
    }
}

fn vm_err(e: impl std::fmt::Display) -> BlockchainError {
    BlockchainError::SmartContractError(e.to_string())
}

impl SmartContractVM {
    pub fn new() -> Result<Self> {
        let mut config = Config::new();
        config.wasm_multi_memory(true);
        config.wasm_bulk_memory(true);
        config.consume_fuel(true);

        let engine = Engine::new(&config).map_err(vm_err)?;

        Ok(Self {
            engine,
            contracts: HashMap::new(),
            gas_meter: GasMeter::new(0),
            deploy_nonce: 0,
        })
    }

    /// Compile `deployment.code` (binary or text WebAssembly), run the optional
    /// `constructor` export and register the contract.
    pub fn deploy_contract(&mut self, deployment: ContractDeployment) -> Result<Address> {
        if deployment.gas_limit > MAX_GAS_LIMIT {
            return Err(vm_err("Gas limit exceeds maximum"));
        }

        self.gas_meter = GasMeter::new(deployment.gas_limit);

        let module = Module::new(&self.engine, &deployment.code)
            .map_err(|e| vm_err(format!("Invalid WASM: {e}")))?;

        let contract_address = Self::generate_contract_address(
            &deployment.deployer,
            &deployment.code,
            self.deploy_nonce,
        );

        let execution_result = self.execute(
            &module,
            &contract_address,
            HashMap::new(),
            "constructor",
            &deployment.constructor_params,
            true,
        )?;

        if !execution_result.success {
            return Err(vm_err(
                execution_result
                    .error
                    .unwrap_or_else(|| "Constructor failed".to_string()),
            ));
        }

        let mut state = ContractState {
            balance: deployment.value,
            ..Default::default()
        };
        for change in execution_result.state_changes {
            state.storage.insert(change.key, change.new_value);
        }

        self.contracts.insert(
            contract_address.clone(),
            SmartContract {
                address: contract_address.clone(),
                code: deployment.code,
                state,
                owner: deployment.deployer,
                created_at: chrono::Utc::now(),
                gas_used: execution_result.gas_used,
            },
        );
        self.deploy_nonce += 1;

        Ok(contract_address)
    }

    /// Execute an exported function of a deployed contract.
    pub fn call_contract(&mut self, call: ContractCall) -> Result<ExecutionResult> {
        if call.gas_limit > MAX_GAS_LIMIT {
            return Err(vm_err("Gas limit exceeds maximum"));
        }

        self.gas_meter = GasMeter::new(call.gas_limit);

        let contract = self
            .contracts
            .get(&call.contract_address)
            .ok_or_else(|| vm_err("Contract not found"))?;
        let module = Module::new(&self.engine, &contract.code)
            .map_err(|e| vm_err(format!("Invalid WASM: {e}")))?;
        let storage = contract.state.storage.clone();

        let result = self.execute(
            &module,
            &call.contract_address,
            storage,
            &call.function_name,
            &call.parameters,
            false,
        )?;

        if let Some(contract) = self.contracts.get_mut(&call.contract_address) {
            if result.success {
                for change in &result.state_changes {
                    contract
                        .state
                        .storage
                        .insert(change.key.clone(), change.new_value.clone());
                }
                contract.state.balance = contract.state.balance.saturating_add(call.value);
                contract.state.nonce += 1;
            }
            contract.gas_used = contract.gas_used.saturating_add(result.gas_used);
        }

        Ok(result)
    }

    pub fn get_contract(&self, address: &str) -> Option<&SmartContract> {
        self.contracts.get(address)
    }

    pub fn get_contract_storage(&self, address: &str, key: &str) -> Option<Vec<u8>> {
        self.contracts
            .get(address)
            .and_then(|contract| contract.state.storage.get(key))
            .cloned()
    }

    /// Integer storage slot as written by `storage_write`.
    pub fn get_storage_slot(&self, address: &str, slot: i32) -> Option<i64> {
        self.get_contract_storage(address, &HostState::slot_key(slot))
            .and_then(|bytes| <[u8; 8]>::try_from(bytes.as_slice()).ok())
            .map(i64::from_le_bytes)
    }

    /// Gas a call would use, without persisting any state changes.
    pub fn estimate_gas(&mut self, call: &ContractCall) -> Result<Gas> {
        let contract = self
            .contracts
            .get(&call.contract_address)
            .ok_or_else(|| vm_err("Contract not found"))?;
        let module = Module::new(&self.engine, &contract.code).map_err(vm_err)?;
        let storage = contract.state.storage.clone();

        self.gas_meter = GasMeter::new(MAX_GAS_LIMIT);
        let result = self.execute(
            &module,
            &call.contract_address,
            storage,
            &call.function_name,
            &call.parameters,
            false,
        )?;
        Ok(result.gas_used)
    }

    fn execute(
        &mut self,
        module: &Module,
        contract_address: &str,
        storage: HashMap<String, Vec<u8>>,
        function_name: &str,
        params: &[ContractParameter],
        optional: bool,
    ) -> Result<ExecutionResult> {
        let host = HostState {
            contract_address: contract_address.to_string(),
            storage,
            changes: Vec::new(),
            logs: Vec::new(),
        };
        let mut store = Store::new(&self.engine, host);
        let initial_fuel = self.gas_meter.remaining_gas();
        store.set_fuel(initial_fuel).map_err(vm_err)?;

        let mut linker = Linker::new(&self.engine);
        Self::setup_host_functions(&mut linker)?;

        let instance = match linker.instantiate(&mut store, module) {
            Ok(instance) => instance,
            Err(e) => return Err(vm_err(format!("Instantiation failed: {e:#}"))),
        };

        let Some(func) = instance.get_func(&mut store, function_name) else {
            if optional {
                self.gas_meter
                    .consume_gas(BASE_DEPLOYMENT_GAS.min(initial_fuel))?;
                return Ok(ExecutionResult {
                    success: true,
                    gas_used: BASE_DEPLOYMENT_GAS.min(initial_fuel),
                    return_data: Vec::new(),
                    logs: Vec::new(),
                    error: None,
                    state_changes: Vec::new(),
                });
            }
            return Err(vm_err(format!("Function '{function_name}' not found")));
        };

        let ty = func.ty(&store);
        let param_types: Vec<ValType> = ty.params().collect();
        if param_types.len() != params.len() {
            return Err(vm_err(format!(
                "Function '{function_name}' expects {} parameters, got {}",
                param_types.len(),
                params.len()
            )));
        }
        let args = params
            .iter()
            .zip(&param_types)
            .map(|(param, ty)| to_wasm_val(param, ty))
            .collect::<Result<Vec<_>>>()?;
        let mut results: Vec<Val> = ty.results().map(|t| default_val(&t)).collect();

        let outcome = func.call(&mut store, &args, &mut results);
        let remaining = store.get_fuel().unwrap_or(0);
        let gas_used = initial_fuel.saturating_sub(remaining);
        self.gas_meter.consume_gas(gas_used)?;

        let host = store.into_data();
        Ok(match outcome {
            Ok(()) => ExecutionResult {
                success: true,
                gas_used,
                return_data: results.iter().flat_map(encode_val).collect(),
                logs: host.logs,
                error: None,
                state_changes: host.changes,
            },
            Err(e) => ExecutionResult {
                success: false,
                gas_used,
                return_data: Vec::new(),
                logs: Vec::new(),
                error: Some(format!("{e:#}")),
                state_changes: Vec::new(),
            },
        })
    }

    fn setup_host_functions(linker: &mut Linker<HostState>) -> Result<()> {
        linker
            .func_wrap(
                "env",
                "storage_read",
                |caller: Caller<'_, HostState>, key: i32| -> i64 { caller.data().read(key) },
            )
            .map_err(vm_err)?;

        linker
            .func_wrap(
                "env",
                "storage_write",
                |mut caller: Caller<'_, HostState>, key: i32, value: i64| {
                    caller.data_mut().write(key, value);
                },
            )
            .map_err(vm_err)?;

        linker
            .func_wrap(
                "env",
                "emit_log",
                |mut caller: Caller<'_, HostState>, topic: i32, value: i64| {
                    caller.data_mut().logs.push(ContractLog {
                        topics: vec![topic.to_string()],
                        data: value.to_le_bytes().to_vec(),
                    });
                },
            )
            .map_err(vm_err)?;

        linker
            .func_wrap(
                "env",
                "debug_print",
                |mut caller: Caller<'_, HostState>, ptr: i32, len: i32| {
                    let Some(Extern::Memory(memory)) = caller.get_export("memory") else {
                        log::debug!("Contract debug (no memory): ptr={ptr}, len={len}");
                        return;
                    };
                    let mut buf = vec![0u8; len.max(0) as usize];
                    if memory.read(&caller, ptr.max(0) as usize, &mut buf).is_ok() {
                        log::debug!("Contract debug: {}", String::from_utf8_lossy(&buf));
                    }
                },
            )
            .map_err(vm_err)?;

        Ok(())
    }

    fn generate_contract_address(deployer: &str, code: &[u8], nonce: u64) -> Address {
        let mut data = Vec::new();
        data.extend_from_slice(deployer.as_bytes());
        data.extend_from_slice(&sha256(code));
        data.extend_from_slice(&nonce.to_be_bytes());

        format!("contract_{}", &hash_to_string(&sha256(&data))[..40])
    }

    pub fn get_contract_balance(&self, address: &str) -> Amount {
        self.contracts
            .get(address)
            .map(|contract| contract.state.balance)
            .unwrap_or(0)
    }

    pub fn transfer_to_contract(&mut self, address: &str, amount: Amount) -> Result<()> {
        let contract = self
            .contracts
            .get_mut(address)
            .ok_or_else(|| vm_err("Contract not found"))?;
        contract.state.balance = contract.state.balance.saturating_add(amount);
        Ok(())
    }

    pub fn list_contracts(&self) -> Vec<&SmartContract> {
        self.contracts.values().collect()
    }

    pub fn calculate_deployment_cost(code: &[u8], gas_limit: Gas) -> Amount {
        let code_cost = code.len() as u64 * 200;
        BASE_DEPLOYMENT_GAS + code_cost + gas_limit * GAS_PRICE
    }

    pub fn calculate_call_cost(gas_limit: Gas) -> Amount {
        BASE_DEPLOYMENT_GAS + gas_limit * GAS_PRICE
    }
}

fn to_wasm_val(param: &ContractParameter, ty: &ValType) -> Result<Val> {
    match (param, ty) {
        (ContractParameter::U32(v), ValType::I32) => Ok(Val::I32(*v as i32)),
        (ContractParameter::U32(v), ValType::I64) => Ok(Val::I64(i64::from(*v))),
        (ContractParameter::U64(v), ValType::I64) => Ok(Val::I64(*v as i64)),
        (ContractParameter::U64(v), ValType::I32) => i32::try_from(*v)
            .map(Val::I32)
            .map_err(|_| vm_err("U64 parameter does not fit in i32")),
        (other, ty) => Err(vm_err(format!(
            "Unsupported parameter {other:?} for wasm type {ty}"
        ))),
    }
}

fn default_val(ty: &ValType) -> Val {
    match ty {
        ValType::I64 => Val::I64(0),
        ValType::F32 => Val::F32(0),
        ValType::F64 => Val::F64(0),
        _ => Val::I32(0),
    }
}

fn encode_val(val: &Val) -> Vec<u8> {
    match val {
        Val::I32(v) => v.to_le_bytes().to_vec(),
        Val::I64(v) => v.to_le_bytes().to_vec(),
        Val::F32(bits) => bits.to_le_bytes().to_vec(),
        Val::F64(bits) => bits.to_le_bytes().to_vec(),
        _ => Vec::new(),
    }
}

/// Ready-made example contracts.
pub struct SimpleContractCompiler;

impl SimpleContractCompiler {
    /// WAT source of a counter contract with `constructor`, `increment`,
    /// `add(i64)` and `get` exports. The counter lives in storage slot 0.
    pub const SIMPLE_STORAGE_WAT: &'static str = r#"
(module
  (import "env" "storage_read" (func $read (param i32) (result i64)))
  (import "env" "storage_write" (func $write (param i32 i64)))
  (import "env" "emit_log" (func $log (param i32 i64)))
  (memory (export "memory") 1)
  (func (export "constructor")
    (call $write (i32.const 0) (i64.const 0)))
  (func (export "increment") (result i64)
    (local $v i64)
    (local.set $v (i64.add (call $read (i32.const 0)) (i64.const 1)))
    (call $write (i32.const 0) (local.get $v))
    (call $log (i32.const 1) (local.get $v))
    (local.get $v))
  (func (export "add") (param $n i64) (result i64)
    (local $v i64)
    (local.set $v (i64.add (call $read (i32.const 0)) (local.get $n)))
    (call $write (i32.const 0) (local.get $v))
    (local.get $v))
  (func (export "get") (result i64)
    (call $read (i32.const 0)))
  (func (export "spin")
    (loop $l (br $l))))
"#;

    /// WAT source of a minimal token contract: `mint(amount)` adds to the
    /// supply in slot 0, `total_supply` reads it.
    pub const TOKEN_WAT: &'static str = r#"
(module
  (import "env" "storage_read" (func $read (param i32) (result i64)))
  (import "env" "storage_write" (func $write (param i32 i64)))
  (func (export "mint") (param $amount i64) (result i64)
    (local $s i64)
    (local.set $s (i64.add (call $read (i32.const 0)) (local.get $amount)))
    (call $write (i32.const 0) (local.get $s))
    (local.get $s))
  (func (export "total_supply") (result i64)
    (call $read (i32.const 0))))
"#;

    /// Compiled (binary) counter contract.
    pub fn compile_simple_storage() -> Vec<u8> {
        wat::parse_str(Self::SIMPLE_STORAGE_WAT).expect("built-in contract is valid WAT")
    }

    /// Compiled (binary) token contract.
    pub fn compile_token_contract() -> Vec<u8> {
        wat::parse_str(Self::TOKEN_WAT).expect("built-in contract is valid WAT")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn deploy(vm: &mut SmartContractVM, code: Vec<u8>) -> Address {
        vm.deploy_contract(ContractDeployment {
            code,
            constructor_params: Vec::new(),
            deployer: "deployer_address".to_string(),
            gas_limit: 1_000_000,
            value: 10,
        })
        .unwrap()
    }

    fn call(address: &str, function: &str, parameters: Vec<ContractParameter>) -> ContractCall {
        ContractCall {
            contract_address: address.to_string(),
            caller: "caller".to_string(),
            function_name: function.to_string(),
            parameters,
            gas_limit: 100_000,
            value: 0,
        }
    }

    fn as_i64(data: &[u8]) -> i64 {
        i64::from_le_bytes(data.try_into().unwrap())
    }

    #[test]
    fn test_vm_creation() {
        assert!(SmartContractVM::new().is_ok());
    }

    #[test]
    fn test_gas_meter() {
        let mut gas_meter = GasMeter::new(1000);
        assert_eq!(gas_meter.remaining_gas(), 1000);

        gas_meter.consume_gas(300).unwrap();
        assert_eq!(gas_meter.remaining_gas(), 700);
        assert_eq!(gas_meter.gas_used, 300);

        assert!(gas_meter.consume_gas(800).is_err());
    }

    #[test]
    fn test_contract_address_generation() {
        let a1 = SmartContractVM::generate_contract_address("deployer1", b"code", 0);
        let a2 = SmartContractVM::generate_contract_address("deployer1", b"code", 1);
        let a3 = SmartContractVM::generate_contract_address("deployer1", b"code", 0);

        assert_ne!(a1, a2);
        assert_eq!(a1, a3);
        assert!(a1.starts_with("contract_"));
    }

    #[test]
    fn test_invalid_wasm_rejected() {
        let mut vm = SmartContractVM::new().unwrap();
        let result = vm.deploy_contract(ContractDeployment {
            code: vec![0x01, 0x02, 0x03],
            constructor_params: Vec::new(),
            deployer: "d".to_string(),
            gas_limit: 1_000_000,
            value: 0,
        });
        assert!(result.is_err());
    }

    #[test]
    fn test_gas_limit_above_maximum_rejected() {
        let mut vm = SmartContractVM::new().unwrap();
        let result = vm.deploy_contract(ContractDeployment {
            code: SimpleContractCompiler::compile_simple_storage(),
            constructor_params: Vec::new(),
            deployer: "d".to_string(),
            gas_limit: MAX_GAS_LIMIT + 1,
            value: 0,
        });
        assert!(result.is_err());
    }

    #[test]
    fn test_counter_contract() {
        let mut vm = SmartContractVM::new().unwrap();
        let address = deploy(&mut vm, SimpleContractCompiler::compile_simple_storage());

        let contract = vm.get_contract(&address).unwrap();
        assert_eq!(contract.state.balance, 10);
        assert!(contract.gas_used > 0);
        assert_eq!(vm.get_storage_slot(&address, 0), Some(0));

        let first = vm
            .call_contract(call(&address, "increment", vec![]))
            .unwrap();
        assert!(first.success, "{:?}", first.error);
        assert_eq!(as_i64(&first.return_data), 1);
        assert_eq!(first.logs.len(), 1);
        assert_eq!(first.state_changes.len(), 1);
        assert!(first.gas_used > 0);

        let second = vm
            .call_contract(call(&address, "increment", vec![]))
            .unwrap();
        assert_eq!(as_i64(&second.return_data), 2);

        let added = vm
            .call_contract(call(&address, "add", vec![ContractParameter::U64(40)]))
            .unwrap();
        assert_eq!(as_i64(&added.return_data), 42);

        let read = vm.call_contract(call(&address, "get", vec![])).unwrap();
        assert_eq!(as_i64(&read.return_data), 42);
        assert_eq!(vm.get_storage_slot(&address, 0), Some(42));
    }

    #[test]
    fn test_contract_text_format_accepted() {
        let mut vm = SmartContractVM::new().unwrap();
        let address = deploy(
            &mut vm,
            SimpleContractCompiler::TOKEN_WAT.as_bytes().to_vec(),
        );
        let minted = vm
            .call_contract(call(&address, "mint", vec![ContractParameter::U32(500)]))
            .unwrap();
        assert_eq!(as_i64(&minted.return_data), 500);
        let supply = vm
            .call_contract(call(&address, "total_supply", vec![]))
            .unwrap();
        assert_eq!(as_i64(&supply.return_data), 500);
    }

    #[test]
    fn test_out_of_gas() {
        let mut vm = SmartContractVM::new().unwrap();
        let address = deploy(&mut vm, SimpleContractCompiler::compile_simple_storage());

        let mut spin = call(&address, "spin", vec![]);
        spin.gas_limit = 5_000;
        let result = vm.call_contract(spin).unwrap();
        assert!(!result.success);
        assert!(result.error.is_some());
        assert_eq!(result.gas_used, 5_000);
    }

    #[test]
    fn test_call_errors() {
        let mut vm = SmartContractVM::new().unwrap();
        assert!(vm.call_contract(call("nope", "get", vec![])).is_err());

        let address = deploy(&mut vm, SimpleContractCompiler::compile_simple_storage());
        assert!(vm.call_contract(call(&address, "missing", vec![])).is_err());
        assert!(
            vm.call_contract(call(&address, "get", vec![ContractParameter::U32(1)]))
                .is_err()
        );
        assert!(
            vm.call_contract(call(
                &address,
                "add",
                vec![ContractParameter::String("x".into())]
            ))
            .is_err()
        );
    }

    #[test]
    fn test_estimate_gas_does_not_mutate() {
        let mut vm = SmartContractVM::new().unwrap();
        let address = deploy(&mut vm, SimpleContractCompiler::compile_simple_storage());
        let gas = vm
            .estimate_gas(&call(&address, "increment", vec![]))
            .unwrap();
        assert!(gas > 0);
        assert_eq!(vm.get_storage_slot(&address, 0), Some(0));
    }

    #[test]
    fn test_empty_module_deploys_without_constructor() {
        let mut vm = SmartContractVM::new().unwrap();
        let address = deploy(
            &mut vm,
            vec![0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00],
        );
        assert_eq!(
            vm.get_contract(&address).unwrap().gas_used,
            BASE_DEPLOYMENT_GAS
        );
        vm.transfer_to_contract(&address, 5).unwrap();
        assert_eq!(vm.get_contract_balance(&address), 15);
        assert_eq!(vm.list_contracts().len(), 1);
    }

    #[test]
    fn test_cost_calculation() {
        let code = vec![0u8; 1000];
        let cost = SmartContractVM::calculate_deployment_cost(&code, 500_000);
        assert_eq!(cost, 21_000 + 200_000 + 500_000);
        assert_eq!(SmartContractVM::calculate_call_cost(1000), 22_000);
    }

    #[test]
    fn test_contract_parameter_serialization() {
        let param = ContractParameter::U64(12345);
        let bytes = crate::codec::encode(&param).unwrap();
        let decoded: ContractParameter = crate::codec::decode(&bytes).unwrap();
        assert_eq!(decoded, param);

        let json = serde_json::to_string(&param).unwrap();
        assert_eq!(json, r#"{"U64":12345}"#);
    }
}
