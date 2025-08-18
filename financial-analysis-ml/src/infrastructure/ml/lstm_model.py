"""LSTM model for time series prediction."""
from typing import Any, Dict, List, Optional, Tuple
import pandas as pd
import numpy as np
from datetime import datetime
import logging

from .base_model import BaseMLModel, FeatureEngineer

logger = logging.getLogger(__name__)

try:
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras import layers
    from sklearn.preprocessing import MinMaxScaler
    from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
    TENSORFLOW_AVAILABLE = True
except ImportError:
    TENSORFLOW_AVAILABLE = False
    logger.warning("TensorFlow not available. LSTM model will not work.")


class LSTMModel(BaseMLModel):
    """LSTM model for financial time series prediction."""
    
    def __init__(
        self,
        sequence_length: int = 60,
        lstm_units: List[int] = [50, 50],
        dropout_rate: float = 0.2,
        dense_units: List[int] = [25],
        learning_rate: float = 0.001,
        model_name: str = "LSTM",
        model_version: str = "1.0"
    ):
        if not TENSORFLOW_AVAILABLE:
            raise ImportError("TensorFlow is required for LSTM model")
        
        super().__init__(model_name, model_version)
        
        self.sequence_length = sequence_length
        self.lstm_units = lstm_units
        self.dropout_rate = dropout_rate
        self.dense_units = dense_units
        self.learning_rate = learning_rate
        
        self.scaler = MinMaxScaler()
        self.feature_scaler = MinMaxScaler()
        self.target_scaler = MinMaxScaler()
        
        # Model architecture parameters
        self.input_shape = None
        self.feature_columns = []
    
    async def prepare_features(self, data: pd.DataFrame) -> pd.DataFrame:
        """Prepare features for LSTM model."""
        logger.info("Preparing features for LSTM model")
        
        # Add technical indicators
        data = FeatureEngineer.add_technical_indicators(data)
        
        # Select relevant features
        feature_columns = [
            'open_price', 'high_price', 'low_price', 'close_price', 'volume',
            'sma_5', 'sma_10', 'sma_20', 'ema_12', 'ema_26',
            'macd', 'rsi', 'bb_position', 'volume_ratio',
            'price_change', 'volatility'
        ]
        
        # Keep only available columns
        available_columns = [col for col in feature_columns if col in data.columns]
        
        # Handle missing values
        data = FeatureEngineer.handle_missing_values(data, method='forward_fill')
        
        # Store feature columns
        self.feature_columns = available_columns
        
        logger.info(f"Prepared {len(available_columns)} features for LSTM model")
        return data[available_columns].copy()
    
    def _create_sequences(
        self, 
        data: np.ndarray, 
        target: np.ndarray = None
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        """Create sequences for LSTM training/prediction."""
        X = []
        y = [] if target is not None else None
        
        for i in range(self.sequence_length, len(data)):
            X.append(data[i-self.sequence_length:i])
            if target is not None:
                y.append(target[i])
        
        X = np.array(X)
        y = np.array(y) if y else None
        
        return X, y
    
    async def train(
        self,
        training_data: pd.DataFrame,
        target_column: str = 'close_price',
        validation_split: float = 0.2,
        epochs: int = 100,
        batch_size: int = 32,
        early_stopping_patience: int = 10,
        **kwargs
    ) -> Dict[str, Any]:
        """Train the LSTM model."""
        logger.info(f"Training LSTM model with {len(training_data)} samples")
        
        # Prepare features
        feature_data = await self.prepare_features(training_data)
        
        # Ensure target column exists
        if target_column not in training_data.columns:
            raise ValueError(f"Target column '{target_column}' not found in training data")
        
        # Scale features and target
        scaled_features = self.feature_scaler.fit_transform(feature_data.values)
        scaled_target = self.target_scaler.fit_transform(
            training_data[target_column].values.reshape(-1, 1)
        ).flatten()
        
        # Create sequences
        X, y = self._create_sequences(scaled_features, scaled_target)
        
        if len(X) == 0:
            raise ValueError(f"Not enough data to create sequences. Need at least {self.sequence_length + 1} samples")
        
        # Set input shape
        self.input_shape = (X.shape[1], X.shape[2])
        
        # Build model
        self.model = self._build_model()
        
        # Compile model
        self.model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=self.learning_rate),
            loss='mse',
            metrics=['mae']
        )
        
        # Callbacks
        callbacks = [
            keras.callbacks.EarlyStopping(
                patience=early_stopping_patience,
                restore_best_weights=True,
                monitor='val_loss'
            ),
            keras.callbacks.ReduceLROnPlateau(
                monitor='val_loss',
                factor=0.5,
                patience=5,
                min_lr=1e-7
            )
        ]
        
        # Train model
        history = self.model.fit(
            X, y,
            validation_split=validation_split,
            epochs=epochs,
            batch_size=batch_size,
            callbacks=callbacks,
            verbose=1
        )
        
        # Calculate training metrics
        train_predictions = self.model.predict(X)
        train_predictions_rescaled = self.target_scaler.inverse_transform(
            train_predictions.reshape(-1, 1)
        ).flatten()
        y_rescaled = self.target_scaler.inverse_transform(y.reshape(-1, 1)).flatten()
        
        self.training_metrics = {
            'mse': float(mean_squared_error(y_rescaled, train_predictions_rescaled)),
            'mae': float(mean_absolute_error(y_rescaled, train_predictions_rescaled)),
            'r2': float(r2_score(y_rescaled, train_predictions_rescaled)),
            'final_loss': float(history.history['loss'][-1]),
            'final_val_loss': float(history.history['val_loss'][-1]),
            'epochs_trained': len(history.history['loss'])
        }
        
        self.is_trained = True
        
        logger.info(f"LSTM model training completed. MSE: {self.training_metrics['mse']:.6f}")
        return self.training_metrics
    
    def _build_model(self) -> keras.Model:
        """Build LSTM model architecture."""
        model = keras.Sequential()
        
        # First LSTM layer
        if len(self.lstm_units) > 1:
            model.add(layers.LSTM(
                self.lstm_units[0],
                return_sequences=True,
                input_shape=self.input_shape
            ))
        else:
            model.add(layers.LSTM(
                self.lstm_units[0],
                return_sequences=False,
                input_shape=self.input_shape
            ))
        
        model.add(layers.Dropout(self.dropout_rate))
        
        # Additional LSTM layers
        for i, units in enumerate(self.lstm_units[1:], 1):
            return_sequences = i < len(self.lstm_units) - 1
            model.add(layers.LSTM(units, return_sequences=return_sequences))
            model.add(layers.Dropout(self.dropout_rate))
        
        # Dense layers
        for units in self.dense_units:
            model.add(layers.Dense(units, activation='relu'))
            model.add(layers.Dropout(self.dropout_rate))
        
        # Output layer
        model.add(layers.Dense(1))
        
        return model
    
    async def predict(
        self,
        data: pd.DataFrame,
        return_confidence: bool = True,
        **kwargs
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        """Make predictions using the trained LSTM model."""
        if not self.is_trained:
            raise ValueError("Model must be trained before making predictions")
        
        logger.info(f"Making LSTM predictions for {len(data)} samples")
        
        # Prepare features
        feature_data = await self.prepare_features(data)
        
        # Scale features
        scaled_features = self.feature_scaler.transform(feature_data.values)
        
        # Create sequences
        X, _ = self._create_sequences(scaled_features)
        
        if len(X) == 0:
            raise ValueError(f"Not enough data to create sequences for prediction")
        
        # Make predictions
        scaled_predictions = self.model.predict(X)
        
        # Rescale predictions
        predictions = self.target_scaler.inverse_transform(
            scaled_predictions.reshape(-1, 1)
        ).flatten()
        
        # Calculate confidence intervals (using prediction variance)
        confidence_intervals = None
        if return_confidence:
            # Monte Carlo dropout for uncertainty estimation
            n_samples = 100
            mc_predictions = []
            
            # Enable dropout during prediction
            for layer in self.model.layers:
                if isinstance(layer, layers.Dropout):
                    layer.training = True
            
            for _ in range(n_samples):
                mc_pred = self.model.predict(X, verbose=0)
                mc_pred_rescaled = self.target_scaler.inverse_transform(
                    mc_pred.reshape(-1, 1)
                ).flatten()
                mc_predictions.append(mc_pred_rescaled)
            
            # Disable dropout
            for layer in self.model.layers:
                if isinstance(layer, layers.Dropout):
                    layer.training = False
            
            mc_predictions = np.array(mc_predictions)
            
            # Calculate confidence intervals (95%)
            confidence_intervals = np.percentile(mc_predictions, [2.5, 97.5], axis=0).T
        
        logger.info(f"Generated {len(predictions)} LSTM predictions")
        return predictions, confidence_intervals
    
    async def evaluate(
        self,
        test_data: pd.DataFrame,
        target_column: str = 'close_price',
        **kwargs
    ) -> Dict[str, float]:
        """Evaluate LSTM model performance."""
        if not self.is_trained:
            raise ValueError("Model must be trained before evaluation")
        
        logger.info(f"Evaluating LSTM model on {len(test_data)} samples")
        
        # Prepare features
        feature_data = await self.prepare_features(test_data)
        
        # Scale features and target
        scaled_features = self.feature_scaler.transform(feature_data.values)
        scaled_target = self.target_scaler.transform(
            test_data[target_column].values.reshape(-1, 1)
        ).flatten()
        
        # Create sequences
        X, y = self._create_sequences(scaled_features, scaled_target)
        
        if len(X) == 0:
            raise ValueError("Not enough test data to create sequences")
        
        # Make predictions
        scaled_predictions = self.model.predict(X)
        
        # Rescale for evaluation
        predictions = self.target_scaler.inverse_transform(
            scaled_predictions.reshape(-1, 1)
        ).flatten()
        y_true = self.target_scaler.inverse_transform(y.reshape(-1, 1)).flatten()
        
        # Calculate metrics
        metrics = {
            'mse': float(mean_squared_error(y_true, predictions)),
            'mae': float(mean_absolute_error(y_true, predictions)),
            'rmse': float(np.sqrt(mean_squared_error(y_true, predictions))),
            'r2': float(r2_score(y_true, predictions)),
            'mape': float(np.mean(np.abs((y_true - predictions) / y_true)) * 100)
        }
        
        logger.info(f"LSTM evaluation completed. RMSE: {metrics['rmse']:.6f}")
        return metrics