package com.cryptotrading;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * Main application class for the Crypto Trading Platform
 */
@SpringBootApplication
@EnableAsync
@EnableScheduling
@EnableTransactionManagement
public class CryptoTradingApplication {

    public static void main(String[] args) {
        SpringApplication.run(CryptoTradingApplication.class, args);
    }
}