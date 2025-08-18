use crate::crypto::{sha256, hash_to_string};
use crate::error::{BlockchainError, Result};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MerkleTree {
    pub root: Option<MerkleNode>,
    pub leaves: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MerkleNode {
    pub hash: String,
    pub left: Option<Box<MerkleNode>>,
    pub right: Option<Box<MerkleNode>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MerkleProof {
    pub leaf_hash: String,
    pub proof_hashes: Vec<ProofElement>,
    pub root_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProofElement {
    pub hash: String,
    pub is_left: bool,
}

impl MerkleTree {
    pub fn new(data: Vec<&[u8]>) -> Result<Self> {
        if data.is_empty() {
            return Ok(MerkleTree {
                root: None,
                leaves: Vec::new(),
            });
        }

        let leaves: Vec<String> = data
            .iter()
            .map(|item| hash_to_string(&sha256(item)))
            .collect();

        let root = Self::build_tree(&leaves)?;

        Ok(MerkleTree {
            root: Some(root),
            leaves,
        })
    }

    pub fn from_transaction_ids(tx_ids: &[String]) -> Result<Self> {
        if tx_ids.is_empty() {
            return Ok(MerkleTree {
                root: None,
                leaves: Vec::new(),
            });
        }

        let leaves = tx_ids.to_vec();
        let root = Self::build_tree(&leaves)?;

        Ok(MerkleTree {
            root: Some(root),
            leaves,
        })
    }

    fn build_tree(leaves: &[String]) -> Result<MerkleNode> {
        if leaves.is_empty() {
            return Err(BlockchainError::ValidationError(
                "Cannot build merkle tree from empty leaves".to_string(),
            ));
        }

        if leaves.len() == 1 {
            return Ok(MerkleNode {
                hash: leaves[0].clone(),
                left: None,
                right: None,
            });
        }

        let mut current_level: VecDeque<MerkleNode> = leaves
            .iter()
            .map(|hash| MerkleNode {
                hash: hash.clone(),
                left: None,
                right: None,
            })
            .collect();

        // If odd number of nodes, duplicate the last one
        if current_level.len() % 2 == 1 {
            let last_node = current_level.back().unwrap().clone();
            current_level.push_back(last_node);
        }

        while current_level.len() > 1 {
            let mut next_level = VecDeque::new();

            while let (Some(left), Some(right)) = (current_level.pop_front(), current_level.pop_front()) {
                let combined_hash = Self::combine_hashes(&left.hash, &right.hash);
                let parent = MerkleNode {
                    hash: combined_hash,
                    left: Some(Box::new(left)),
                    right: Some(Box::new(right)),
                };
                next_level.push_back(parent);
            }

            // If odd number of nodes in next level, duplicate the last one
            if next_level.len() % 2 == 1 && next_level.len() > 1 {
                let last_node = next_level.back().unwrap().clone();
                next_level.push_back(last_node);
            }

            current_level = next_level;
        }

        Ok(current_level.into_iter().next().unwrap())
    }

    fn combine_hashes(left: &str, right: &str) -> String {
        let left_bytes = hex::decode(left).unwrap_or_default();
        let right_bytes = hex::decode(right).unwrap_or_default();
        let mut combined = Vec::new();
        combined.extend_from_slice(&left_bytes);
        combined.extend_from_slice(&right_bytes);
        hash_to_string(&sha256(&combined))
    }

    pub fn get_root_hash(&self) -> Option<String> {
        self.root.as_ref().map(|node| node.hash.clone())
    }

    pub fn generate_proof(&self, leaf_hash: &str) -> Result<MerkleProof> {
        let root = self.root.as_ref().ok_or_else(|| {
            BlockchainError::ValidationError("Cannot generate proof for empty tree".to_string())
        })?;

        let mut proof_hashes = Vec::new();
        let found = Self::find_proof_path(root, leaf_hash, &mut proof_hashes);

        if !found {
            return Err(BlockchainError::ValidationError(format!(
                "Leaf hash {} not found in tree",
                leaf_hash
            )));
        }

        Ok(MerkleProof {
            leaf_hash: leaf_hash.to_string(),
            proof_hashes,
            root_hash: root.hash.clone(),
        })
    }

    fn find_proof_path(
        node: &MerkleNode,
        target_hash: &str,
        proof_hashes: &mut Vec<ProofElement>,
    ) -> bool {
        // If this is a leaf node
        if node.left.is_none() && node.right.is_none() {
            return node.hash == target_hash;
        }

        // Check left subtree
        if let Some(left_child) = &node.left {
            if Self::find_proof_path(left_child, target_hash, proof_hashes) {
                // Target is in left subtree, add right sibling to proof
                if let Some(right_child) = &node.right {
                    proof_hashes.push(ProofElement {
                        hash: right_child.hash.clone(),
                        is_left: false,
                    });
                }
                return true;
            }
        }

        // Check right subtree
        if let Some(right_child) = &node.right {
            if Self::find_proof_path(right_child, target_hash, proof_hashes) {
                // Target is in right subtree, add left sibling to proof
                if let Some(left_child) = &node.left {
                    proof_hashes.push(ProofElement {
                        hash: left_child.hash.clone(),
                        is_left: true,
                    });
                }
                return true;
            }
        }

        false
    }

    pub fn verify_proof(proof: &MerkleProof) -> bool {
        let mut current_hash = proof.leaf_hash.clone();

        for proof_element in proof.proof_hashes.iter().rev() {
            current_hash = if proof_element.is_left {
                Self::combine_hashes(&proof_element.hash, &current_hash)
            } else {
                Self::combine_hashes(&current_hash, &proof_element.hash)
            };
        }

        current_hash == proof.root_hash
    }

    pub fn contains(&self, leaf_hash: &str) -> bool {
        self.leaves.contains(&leaf_hash.to_string())
    }

    pub fn size(&self) -> usize {
        self.leaves.len()
    }

    pub fn is_empty(&self) -> bool {
        self.leaves.is_empty()
    }

    pub fn height(&self) -> usize {
        if self.leaves.is_empty() {
            return 0;
        }
        (self.leaves.len() as f64).log2().ceil() as usize
    }
}

impl Default for MerkleTree {
    fn default() -> Self {
        Self {
            root: None,
            leaves: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_tree() {
        let tree = MerkleTree::new(vec![]).unwrap();
        assert!(tree.is_empty());
        assert_eq!(tree.get_root_hash(), None);
    }

    #[test]
    fn test_single_leaf() {
        let data = vec![b"transaction1"];
        let tree = MerkleTree::new(data).unwrap();
        assert_eq!(tree.size(), 1);
        assert!(tree.get_root_hash().is_some());
    }

    #[test]
    fn test_multiple_leaves() {
        let data = vec![b"tx1", b"tx2", b"tx3", b"tx4"];
        let tree = MerkleTree::new(data).unwrap();
        assert_eq!(tree.size(), 4);
        assert!(tree.get_root_hash().is_some());
    }

    #[test]
    fn test_odd_number_of_leaves() {
        let data = vec![b"tx1", b"tx2", b"tx3"];
        let tree = MerkleTree::new(data).unwrap();
        assert_eq!(tree.size(), 3);
        assert!(tree.get_root_hash().is_some());
    }

    #[test]
    fn test_proof_generation_and_verification() {
        let data = vec![b"tx1", b"tx2", b"tx3", b"tx4"];
        let tree = MerkleTree::new(data).unwrap();
        
        let leaf_hash = hash_to_string(&sha256(b"tx2"));
        let proof = tree.generate_proof(&leaf_hash).unwrap();
        
        assert!(MerkleTree::verify_proof(&proof));
        assert_eq!(proof.leaf_hash, leaf_hash);
        assert_eq!(proof.root_hash, tree.get_root_hash().unwrap());
    }

    #[test]
    fn test_invalid_proof() {
        let data = vec![b"tx1", b"tx2", b"tx3", b"tx4"];
        let tree = MerkleTree::new(data).unwrap();
        
        let invalid_leaf = hash_to_string(&sha256(b"invalid_tx"));
        let result = tree.generate_proof(&invalid_leaf);
        assert!(result.is_err());
    }

    #[test]
    fn test_contains() {
        let data = vec![b"tx1", b"tx2", b"tx3"];
        let tree = MerkleTree::new(data).unwrap();
        
        let tx1_hash = hash_to_string(&sha256(b"tx1"));
        let tx4_hash = hash_to_string(&sha256(b"tx4"));
        
        assert!(tree.contains(&tx1_hash));
        assert!(!tree.contains(&tx4_hash));
    }

    #[test]
    fn test_from_transaction_ids() {
        let tx_ids = vec![
            "tx1_hash".to_string(),
            "tx2_hash".to_string(),
            "tx3_hash".to_string(),
        ];
        
        let tree = MerkleTree::from_transaction_ids(&tx_ids).unwrap();
        assert_eq!(tree.size(), 3);
        assert!(tree.contains("tx1_hash"));
        assert!(tree.contains("tx2_hash"));
        assert!(tree.contains("tx3_hash"));
    }

    #[test]
    fn test_deterministic_root() {
        let data = vec![b"tx1", b"tx2", b"tx3", b"tx4"];
        let tree1 = MerkleTree::new(data.clone()).unwrap();
        let tree2 = MerkleTree::new(data).unwrap();
        
        assert_eq!(tree1.get_root_hash(), tree2.get_root_hash());
    }
}