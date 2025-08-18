"""Base ML model interface."""
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Tuple
import pandas as pd
import numpy as np
from datetime import datetime
from decimal import Decimal


class BaseMLModel(ABC):
    """Abstract base class for ML models."""
    
    def __init__(self, model_name: str, model_version: str = "1.0"):
        self.model_name = model_name
        self.model_version = model_version
        self.model = None
        self.is_trained = False
        self.training_metrics = {}
        self.feature_columns = []
    
    @abstractmethod
    async def prepare_features(self, data: pd.DataFrame) -> pd.DataFrame:
        """Prepare features from raw data."""
        pass
    
    @abstractmethod
    async def train(
        self,
        training_data: pd.DataFrame,
        target_column: str,
        **kwargs
    ) -> Dict[str, Any]:
        """Train the model."""
        pass
    
    @abstractmethod
    async def predict(
        self,
        data: pd.DataFrame,
        **kwargs
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        """Make predictions. Returns (predictions, confidence_intervals)."""
        pass
    
    @abstractmethod
    async def evaluate(
        self,
        test_data: pd.DataFrame,
        target_column: str,
        **kwargs
    ) -> Dict[str, float]:
        """Evaluate model performance."""
        pass
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get model information."""
        return {
            "name": self.model_name,
            "version": self.model_version,
            "is_trained": self.is_trained,
            "training_metrics": self.training_metrics,
            "feature_columns": self.feature_columns,
        }
    
    async def save_model(self, file_path: str) -> bool:
        """Save trained model to file."""
        try:
            import joblib
            
            model_data = {
                "model": self.model,
                "model_name": self.model_name,
                "model_version": self.model_version,
                "is_trained": self.is_trained,
                "training_metrics": self.training_metrics,
                "feature_columns": self.feature_columns,
            }
            
            joblib.dump(model_data, file_path)
            return True
        
        except Exception as e:
            print(f"Error saving model: {e}")
            return False
    
    async def load_model(self, file_path: str) -> bool:
        """Load trained model from file."""
        try:
            import joblib
            
            model_data = joblib.load(file_path)
            
            self.model = model_data["model"]
            self.model_name = model_data["model_name"]
            self.model_version = model_data["model_version"]
            self.is_trained = model_data["is_trained"]
            self.training_metrics = model_data["training_metrics"]
            self.feature_columns = model_data["feature_columns"]
            
            return True
        
        except Exception as e:
            print(f"Error loading model: {e}")
            return False


class FeatureEngineer:
    """Feature engineering utilities."""
    
    @staticmethod
    def add_technical_indicators(df: pd.DataFrame) -> pd.DataFrame:
        """Add technical indicators to price data."""
        df = df.copy()
        
        # Simple Moving Averages
        df['sma_5'] = df['close_price'].rolling(window=5).mean()
        df['sma_10'] = df['close_price'].rolling(window=10).mean()
        df['sma_20'] = df['close_price'].rolling(window=20).mean()
        df['sma_50'] = df['close_price'].rolling(window=50).mean()
        
        # Exponential Moving Averages
        df['ema_12'] = df['close_price'].ewm(span=12).mean()
        df['ema_26'] = df['close_price'].ewm(span=26).mean()
        
        # MACD
        df['macd'] = df['ema_12'] - df['ema_26']
        df['macd_signal'] = df['macd'].ewm(span=9).mean()
        df['macd_histogram'] = df['macd'] - df['macd_signal']
        
        # RSI
        delta = df['close_price'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        df['rsi'] = 100 - (100 / (1 + rs))
        
        # Bollinger Bands
        df['bb_middle'] = df['close_price'].rolling(window=20).mean()
        bb_std = df['close_price'].rolling(window=20).std()
        df['bb_upper'] = df['bb_middle'] + (bb_std * 2)
        df['bb_lower'] = df['bb_middle'] - (bb_std * 2)
        df['bb_width'] = df['bb_upper'] - df['bb_lower']
        df['bb_position'] = (df['close_price'] - df['bb_lower']) / df['bb_width']
        
        # Volume indicators
        df['volume_sma'] = df['volume'].rolling(window=20).mean()
        df['volume_ratio'] = df['volume'] / df['volume_sma']
        
        # Price-based features
        df['price_change'] = df['close_price'].pct_change()
        df['price_range'] = (df['high_price'] - df['low_price']) / df['close_price']
        df['upper_shadow'] = (df['high_price'] - df[['open_price', 'close_price']].max(axis=1)) / df['close_price']
        df['lower_shadow'] = (df[['open_price', 'close_price']].min(axis=1) - df['low_price']) / df['close_price']
        
        # Volatility
        df['volatility'] = df['price_change'].rolling(window=20).std()
        
        return df
    
    @staticmethod
    def add_lag_features(df: pd.DataFrame, columns: List[str], lags: List[int]) -> pd.DataFrame:
        """Add lagged features."""
        df = df.copy()
        
        for col in columns:
            for lag in lags:
                df[f'{col}_lag_{lag}'] = df[col].shift(lag)
        
        return df
    
    @staticmethod
    def add_rolling_features(
        df: pd.DataFrame, 
        columns: List[str], 
        windows: List[int],
        operations: List[str] = ['mean', 'std', 'min', 'max']
    ) -> pd.DataFrame:
        """Add rolling window features."""
        df = df.copy()
        
        for col in columns:
            for window in windows:
                for op in operations:
                    if op == 'mean':
                        df[f'{col}_rolling_{window}_mean'] = df[col].rolling(window).mean()
                    elif op == 'std':
                        df[f'{col}_rolling_{window}_std'] = df[col].rolling(window).std()
                    elif op == 'min':
                        df[f'{col}_rolling_{window}_min'] = df[col].rolling(window).min()
                    elif op == 'max':
                        df[f'{col}_rolling_{window}_max'] = df[col].rolling(window).max()
        
        return df
    
    @staticmethod
    def handle_missing_values(df: pd.DataFrame, method: str = 'forward_fill') -> pd.DataFrame:
        """Handle missing values in the dataset."""
        df = df.copy()
        
        if method == 'forward_fill':
            df = df.fillna(method='ffill')
        elif method == 'backward_fill':
            df = df.fillna(method='bfill')
        elif method == 'interpolate':
            df = df.interpolate()
        elif method == 'drop':
            df = df.dropna()
        elif method == 'zero':
            df = df.fillna(0)
        
        return df
    
    @staticmethod
    def normalize_features(df: pd.DataFrame, columns: List[str]) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """Normalize features using min-max scaling."""
        from sklearn.preprocessing import MinMaxScaler
        
        df = df.copy()
        scaler_info = {}
        
        for col in columns:
            if col in df.columns:
                scaler = MinMaxScaler()
                df[col] = scaler.fit_transform(df[[col]])
                scaler_info[col] = {
                    'min': scaler.data_min_[0],
                    'max': scaler.data_max_[0],
                    'scale': scaler.scale_[0]
                }
        
        return df, scaler_info