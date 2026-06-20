# GraphRAG + GNN Training Environment

This project keeps PyTorch and PyTorch Geometric in a dedicated environment so the existing SupplyGuard runtime remains stable.

## Recommended Environment

Environment name: `supplyguard-gnn`

Python version: `3.11` or `3.12`

## Create Environment

```powershell
conda create -n supplyguard-gnn python=3.11 -y
conda activate supplyguard-gnn
```

## Install PyTorch

Use the official PyTorch selector before running the install command:

https://pytorch.org/get-started/locally/

The project target machine has an NVIDIA GPU, so choose Windows, pip or conda, Python, and a CUDA build supported by the installed driver.

## Install PyTorch Geometric

Use the official PyG installation guide:

https://pytorch-geometric.readthedocs.io/en/latest/install/installation.html

The minimal install is:

```powershell
pip install torch_geometric
```

## Verify

```powershell
python -c "import torch; print(torch.__version__); print(torch.cuda.is_available())"
python -c "import torch_geometric; print(torch_geometric.__version__)"
```

Expected:

- First command prints a torch version and `True` when CUDA is available.
- Second command prints a torch_geometric version.

## Runtime Rule

The backend must not require this environment. If PyTorch or PyG is unavailable, SupplyGuard falls back to NumPy GraphSAGE, scikit-learn, or rule scoring.
