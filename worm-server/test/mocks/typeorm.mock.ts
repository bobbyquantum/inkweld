import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions } from 'typeorm';

const testDataSourceOptions: DataSourceOptions = {
  type: 'sqlite',
  database: ':memory:',
  dropSchema: true,
  entities: [],
  synchronize: true,
};

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => testDataSourceOptions,
      dataSourceFactory: async (options) => {
        return new DataSource(options).initialize();
      },
    }),
  ],
  exports: [TypeOrmModule],
})
export class MockTypeOrmModule {}
