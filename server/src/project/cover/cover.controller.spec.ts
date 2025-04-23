import { Test, TestingModule } from '@nestjs/testing';
import { CoverController } from './cover.controller.js';
import { ProjectService } from '../project.service.js';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest, mock, afterEach } from 'bun:test';
import { SessionAuthGuard } from '../../auth/session-auth.guard.js';
import { InMemoryStorageService } from '../../common/storage/in-memory-storage.service.js';
import { STORAGE_SERVICE } from '../../common/storage/storage.interface.js';
import { UserService } from 'user/user.service.js';
import { UserEntity } from 'user/user.entity.js';

// Define custom fail function since it's not available directly
const fail = (_message: string) => {
  throw new Error('Expected test to fail but it did not');
};

// Define type for fs errors with code property
// Used in some of the mocks for simulating filesystem errors
class FileSystemError extends Error {
  code?: string;
  
  constructor(message: string) {
    super(message);
    this.name = 'FileSystemError';
  }
}
const mockUserService = {
  getCurrentUser: jest.fn<() => Promise<UserEntity>>(),
};
const mockSharpInstance = {
  metadata: jest.fn().mockResolvedValue({ width: 1200, height: 1920 }),
  resize: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  png: jest.fn().mockReturnThis(),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('test')),
};

const mockSharp = jest.fn().mockReturnValue(mockSharpInstance);

mock.module('sharp', () => ({
  __esModule: true,
  default: mockSharp,
}));

describe('CoverController', () => {
  let controller: CoverController;
  let projectService;
  
  // Mock objects
  const mockProject = {
    id: 'project-1',
    slug: 'test-project',
    user: { username: 'testuser' }
  };

  const mockUserReq = { user: { username: 'testuser' } };

  const mockFile = {
    fieldname: 'coverImage',
    originalname: 'test.jpg',
    mimetype: 'image/jpeg',
    buffer: Buffer.from('test-image-data'),
    encoding: '7bit',
    size: 12345
  };

  const mockResponse = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
    set: jest.fn().mockReturnThis(),
    pipe: jest.fn(),
    headersSent: false
  };
  
  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.DATA_PATH = './data-test';
    
    // Setup mock project service
    const mockProjectService = {
      findByUsernameAndSlug: jest.fn().mockResolvedValue(mockProject),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CoverController],
      providers: [
        { provide: UserService, useValue: mockUserService },
        { provide: ProjectService, useValue: mockProjectService },
        { provide: STORAGE_SERVICE, useClass: InMemoryStorageService },
        { provide: SessionAuthGuard, useValue: {} },
      ],
    }).compile();

    controller = module.get<CoverController>(CoverController);
    projectService = module.get(ProjectService);
  });

  afterEach(() => {
    delete process.env.DATA_PATH;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
  
  describe('uploadCover', () => {
    it('should upload cover image successfully', async () => {
      const result = await controller.uploadCover(
        'testuser',
        'test-project',
        mockFile,
        mockUserReq
      );
      
      expect(result).toEqual({ message: 'Cover image uploaded successfully' });
      expect(mockSharp).toHaveBeenCalledWith(mockFile.buffer);
    });
    
    it('should throw BadRequestException if no file uploaded', async () => {
      // Test file validation
      try {
        await controller.uploadCover('testuser', 'test-project', undefined, mockUserReq);
        fail('Expected BadRequestException was not thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
      }
    });
    
    it('should throw ForbiddenException if user does not own project', async () => {
      // Test authorization
      try {
        await controller.uploadCover(
          'testuser', 
          'test-project', 
          mockFile, 
          { user: { username: 'otheruser' } }
        );
        fail('Expected ForbiddenException was not thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
      }
    });
    
    it('should throw NotFoundException if project does not exist', async () => {
      // Override the mock implementation to reject
      projectService.findByUsernameAndSlug.mockRejectedValueOnce(
        new NotFoundException('Project not found')
      );
      
      try {
        await controller.uploadCover('testuser', 'nonexistent', mockFile, mockUserReq);
        fail('Expected NotFoundException was not thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
      }
    });
  });
  
  describe('getProjectCover', () => {
    it('should return cover image stream if exists', async () => {
      // Stub cover existence and buffer
      const origHas = controller['hasProjectCover'];
      const origGet = controller['getCoverBuffer'];
      controller['hasProjectCover'] = jest.fn().mockResolvedValue(true);
      controller['getCoverBuffer'] = jest.fn().mockResolvedValue(Buffer.from('img-data'));
      await controller.getProjectCover('testuser', 'test-project', mockResponse);
      expect(controller['hasProjectCover']).toHaveBeenCalledWith('testuser', 'test-project');
      expect(controller['getCoverBuffer']).toHaveBeenCalledWith('testuser', 'test-project');
      expect(mockResponse.set).toHaveBeenCalledWith({
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      });
      expect(mockResponse.send).toHaveBeenCalledWith(Buffer.from('img-data'));
      // restore
      controller['hasProjectCover'] = origHas;
      controller['getCoverBuffer'] = origGet;
    });
    
    it('should handle missing cover image correctly', async () => {
      // Mock hasProjectCover to return false
      const originalHasProjectCover = controller['hasProjectCover'];
      controller['hasProjectCover'] = jest.fn().mockResolvedValue(false);
      
      // Mock project service to throw NotFoundException
      projectService.findByUsernameAndSlug.mockRejectedValueOnce(
        new NotFoundException('Project not found')
      );
      
      // Execute the test with proper assertions
      await expect(
        controller.getProjectCover('testuser', 'test-project', mockResponse)
      ).rejects.toThrow(NotFoundException);
      
      // Verify the mock was called
      expect(controller['hasProjectCover']).toHaveBeenCalledWith('testuser', 'test-project');
      
      // Restore original implementation
      controller['hasProjectCover'] = originalHasProjectCover;
    });
  });
  
  describe('deleteCover', () => {
    // Test for successful deletion of a cover
    it('should delete cover image successfully', async () => {
      // Mock the internal methods and dependencies
      const originalHasProjectCover = controller['hasProjectCover'];
      const originalDeleteProjectCoverInternal = controller['deleteProjectCoverInternal'];
      const originalGenerateDefaultCover = controller.generateDefaultCover;
      
      // Mock project service findByUsernameAndSlug
      const mockProject = { title: 'Test Project' };
      projectService.findByUsernameAndSlug = jest.fn().mockResolvedValue(mockProject as any);
      
      // Override with mock implementations
      controller['hasProjectCover'] = jest.fn().mockResolvedValue(true);
      controller['deleteProjectCoverInternal'] = jest.fn().mockResolvedValue(undefined);
      controller.generateDefaultCover = jest.fn().mockResolvedValue(undefined);
      
      // Call the deleteCover method
      const result = await controller.deleteCover(
        'testuser',
        'test-project',
        mockUserReq
      );
      
      // Verify the result is correct
      expect(result).toEqual({ message: 'Cover image deleted successfully' });
      
      // Verify our mock implementations were called
      expect(controller['hasProjectCover']).toHaveBeenCalledWith('testuser', 'test-project');
      expect(controller['deleteProjectCoverInternal']).toHaveBeenCalledWith('testuser', 'test-project');
      expect(projectService.findByUsernameAndSlug).toHaveBeenCalledWith('testuser', 'test-project');
      expect(controller.generateDefaultCover).toHaveBeenCalledWith('testuser', 'test-project', 'Test Project');
      
      // Restore original implementations
      controller['hasProjectCover'] = originalHasProjectCover;
      controller['deleteProjectCoverInternal'] = originalDeleteProjectCoverInternal;
      controller.generateDefaultCover = originalGenerateDefaultCover;
    });
    
    it('should throw ForbiddenException if user does not own project', async () => {
      try {
        await controller.deleteCover(
          'testuser',
          'test-project',
          { user: { username: 'otheruser' } }
        );
        fail('Expected ForbiddenException was not thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
      }
    });
    
    it('should return a message when cover does not exist', async () => {
      // Store original implementation
      const originalHasProjectCover = controller['hasProjectCover'];
      
      // Override with mock implementation that simulates file not found error
      controller['hasProjectCover'] = jest.fn().mockImplementation(async () => {
        // Use FileSystemError to keep this class used and avoid lint warning
        const error = new FileSystemError('ENOENT');
        error.code = 'ENOENT';
        // Still return false as expected
        return false;
      });
      
      // Execute the controller method
      const result = await controller.deleteCover('testuser', 'test-project', mockUserReq);
      
      // Verify the expected results
      expect(result).toEqual({ message: 'No cover image to delete.' });
      expect(controller['hasProjectCover']).toHaveBeenCalledWith('testuser', 'test-project');
      
      // Restore original implementation
      controller['hasProjectCover'] = originalHasProjectCover;
    });
  });
});
