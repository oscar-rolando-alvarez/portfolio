use crate::crypto::{hash_to_string, sha256};
use crate::error::{BlockchainError, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
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

impl MerkleNode {
    fn leaf(hash: String) -> Self {
        Self {
            hash,
            left: None,
            right: None,
        }
    }

    fn is_leaf(&self) -> bool {
        self.left.is_none() && self.right.is_none()
    }
}

/// Inclusion proof. `proof_hashes` are ordered from the leaf level up to the root.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MerkleProof {
    pub leaf_hash: String,
    pub proof_hashes: Vec<ProofElement>,
    pub root_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProofElement {
    pub hash: String,
    /// Whether this sibling sits on the left of the running hash.
    pub is_left: bool,
}

impl MerkleTree {
    /// Build a tree whose leaves are the SHA-256 hashes of `data`.
    pub fn new<T: AsRef<[u8]>>(data: &[T]) -> Result<Self> {
        let leaves: Vec<String> = data
            .iter()
            .map(|item| hash_to_string(&sha256(item.as_ref())))
            .collect();
        Self::from_leaves(leaves)
    }

    /// Build a tree whose leaves are the given transaction ids.
    pub fn from_transaction_ids(tx_ids: &[String]) -> Result<Self> {
        Self::from_leaves(tx_ids.to_vec())
    }

    fn from_leaves(leaves: Vec<String>) -> Result<Self> {
        if leaves.is_empty() {
            return Ok(Self::default());
        }
        let root = Self::build_tree(&leaves)?;
        Ok(Self {
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

        let mut level: Vec<MerkleNode> = leaves.iter().cloned().map(MerkleNode::leaf).collect();

        while level.len() > 1 {
            if level.len() % 2 == 1 {
                let last = level.last().cloned().expect("level is not empty");
                level.push(last);
            }

            let mut next = Vec::with_capacity(level.len() / 2);
            let mut nodes = level.into_iter();
            while let (Some(left), Some(right)) = (nodes.next(), nodes.next()) {
                next.push(MerkleNode {
                    hash: Self::combine_hashes(&left.hash, &right.hash),
                    left: Some(Box::new(left)),
                    right: Some(Box::new(right)),
                });
            }
            level = next;
        }

        Ok(level.pop().expect("tree has a root"))
    }

    fn hash_bytes(hash: &str) -> Vec<u8> {
        hex::decode(hash).unwrap_or_else(|_| hash.as_bytes().to_vec())
    }

    fn combine_hashes(left: &str, right: &str) -> String {
        let mut combined = Self::hash_bytes(left);
        combined.extend_from_slice(&Self::hash_bytes(right));
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
        if !Self::find_proof_path(root, leaf_hash, &mut proof_hashes) {
            return Err(BlockchainError::ValidationError(format!(
                "Leaf hash {leaf_hash} not found in tree"
            )));
        }

        Ok(MerkleProof {
            leaf_hash: leaf_hash.to_string(),
            proof_hashes,
            root_hash: root.hash.clone(),
        })
    }

    /// Depth-first search; siblings are pushed while unwinding, so the
    /// resulting list is ordered from the leaf level upwards.
    fn find_proof_path(
        node: &MerkleNode,
        target_hash: &str,
        proof_hashes: &mut Vec<ProofElement>,
    ) -> bool {
        if node.is_leaf() {
            return node.hash == target_hash;
        }

        if let (Some(left), Some(right)) = (&node.left, &node.right) {
            if Self::find_proof_path(left, target_hash, proof_hashes) {
                proof_hashes.push(ProofElement {
                    hash: right.hash.clone(),
                    is_left: false,
                });
                return true;
            }
            if Self::find_proof_path(right, target_hash, proof_hashes) {
                proof_hashes.push(ProofElement {
                    hash: left.hash.clone(),
                    is_left: true,
                });
                return true;
            }
        }

        false
    }

    pub fn verify_proof(proof: &MerkleProof) -> bool {
        let computed =
            proof
                .proof_hashes
                .iter()
                .fold(proof.leaf_hash.clone(), |current, element| {
                    if element.is_left {
                        Self::combine_hashes(&element.hash, &current)
                    } else {
                        Self::combine_hashes(&current, &element.hash)
                    }
                });
        computed == proof.root_hash
    }

    pub fn contains(&self, leaf_hash: &str) -> bool {
        self.leaves.iter().any(|leaf| leaf == leaf_hash)
    }

    pub fn size(&self) -> usize {
        self.leaves.len()
    }

    pub fn is_empty(&self) -> bool {
        self.leaves.is_empty()
    }

    /// Number of levels above the leaves.
    pub fn height(&self) -> usize {
        match self.leaves.len() {
            0 => 0,
            n => n.next_power_of_two().trailing_zeros() as usize,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn leaf(data: &[u8]) -> String {
        hash_to_string(&sha256(data))
    }

    #[test]
    fn test_empty_tree() {
        let tree = MerkleTree::new::<&[u8]>(&[]).unwrap();
        assert!(tree.is_empty());
        assert_eq!(tree.get_root_hash(), None);
        assert_eq!(tree.height(), 0);
        assert!(tree.generate_proof("anything").is_err());
    }

    #[test]
    fn test_single_leaf() {
        let tree = MerkleTree::new(&[b"transaction1"]).unwrap();
        assert_eq!(tree.size(), 1);
        assert_eq!(tree.get_root_hash(), Some(leaf(b"transaction1")));
        assert_eq!(tree.height(), 0);
    }

    #[test]
    fn test_known_root_for_two_leaves() {
        let tree = MerkleTree::new(&[b"tx1", b"tx2"]).unwrap();
        let mut combined = sha256(b"tx1");
        combined.extend(sha256(b"tx2"));
        assert_eq!(
            tree.get_root_hash(),
            Some(hash_to_string(&sha256(&combined)))
        );
    }

    #[test]
    fn test_multiple_leaves() {
        let tree = MerkleTree::new(&[b"tx1", b"tx2", b"tx3", b"tx4"]).unwrap();
        assert_eq!(tree.size(), 4);
        assert_eq!(tree.height(), 2);
        assert!(tree.get_root_hash().is_some());
    }

    #[test]
    fn test_odd_number_of_leaves() {
        let odd = MerkleTree::new(&[b"tx1", b"tx2", b"tx3"]).unwrap();
        let padded = MerkleTree::new(&[b"tx1", b"tx2", b"tx3", b"tx3"]).unwrap();
        assert_eq!(odd.size(), 3);
        assert_eq!(odd.get_root_hash(), padded.get_root_hash());
    }

    #[test]
    fn test_proof_generation_and_verification() {
        let tree = MerkleTree::new(&[b"tx1", b"tx2", b"tx3", b"tx4"]).unwrap();

        let leaf_hash = leaf(b"tx2");
        let proof = tree.generate_proof(&leaf_hash).unwrap();

        assert!(MerkleTree::verify_proof(&proof));
        assert_eq!(proof.leaf_hash, leaf_hash);
        assert_eq!(proof.root_hash, tree.get_root_hash().unwrap());
        assert_eq!(proof.proof_hashes.len(), 2);
    }

    #[test]
    fn test_every_leaf_has_a_valid_proof() {
        let data: Vec<Vec<u8>> = (0..7).map(|i| format!("tx{i}").into_bytes()).collect();
        let tree = MerkleTree::new(&data).unwrap();
        for item in &data {
            let proof = tree.generate_proof(&leaf(item)).unwrap();
            assert!(MerkleTree::verify_proof(&proof));
        }
    }

    #[test]
    fn test_tampered_proof_fails() {
        let tree = MerkleTree::new(&[b"tx1", b"tx2", b"tx3", b"tx4"]).unwrap();
        let mut proof = tree.generate_proof(&leaf(b"tx1")).unwrap();
        proof.proof_hashes[0].hash = leaf(b"evil");
        assert!(!MerkleTree::verify_proof(&proof));

        let mut proof = tree.generate_proof(&leaf(b"tx1")).unwrap();
        proof.leaf_hash = leaf(b"evil");
        assert!(!MerkleTree::verify_proof(&proof));
    }

    #[test]
    fn test_invalid_proof() {
        let tree = MerkleTree::new(&[b"tx1", b"tx2", b"tx3", b"tx4"]).unwrap();
        assert!(tree.generate_proof(&leaf(b"invalid_tx")).is_err());
    }

    #[test]
    fn test_contains() {
        let tree = MerkleTree::new(&[b"tx1", b"tx2", b"tx3"]).unwrap();
        assert!(tree.contains(&leaf(b"tx1")));
        assert!(!tree.contains(&leaf(b"tx4")));
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
        for id in &tx_ids {
            assert!(tree.contains(id));
            let proof = tree.generate_proof(id).unwrap();
            assert!(MerkleTree::verify_proof(&proof));
        }
    }

    #[test]
    fn test_deterministic_root() {
        let data = [b"tx1", b"tx2", b"tx3", b"tx4"];
        let tree1 = MerkleTree::new(&data).unwrap();
        let tree2 = MerkleTree::new(&data).unwrap();
        assert_eq!(tree1.get_root_hash(), tree2.get_root_hash());

        let reordered = MerkleTree::new(&[b"tx2", b"tx1", b"tx3", b"tx4"]).unwrap();
        assert_ne!(tree1.get_root_hash(), reordered.get_root_hash());
    }
}
