import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { TaskRepo } from './tasks.repo';
import { NotFoundException } from '@nestjs/common';

describe('TasksService', () => {
  let service: TasksService;

  let taskRepo: { findById: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    taskRepo = {
      findById: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TasksService, { provide: TaskRepo, useValue: taskRepo }],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  it('should update a task', async () => {
    const existingTask = { id: 1, title: 'Awal', completed: false };
    const updatedTask = { ...existingTask, title: 'Belanja' };

    taskRepo.findById.mockResolvedValue(existingTask);
    taskRepo.update.mockResolvedValue(updatedTask);

    const result = await service.update(1, { title: 'Belanja' });

    expect(taskRepo.findById).toHaveBeenCalledWith(1);
    expect(taskRepo.update).toHaveBeenCalledWith(1, { title: 'Belanja' });
    expect(result).toEqual(updatedTask);
  });

  it('should throw not found exception', async () => {
    taskRepo.findById.mockResolvedValue(null);

    await expect(service.update(2, { title: 'Belanja' })).rejects.toThrow(
      NotFoundException,
    );

    expect(taskRepo.findById).toHaveBeenCalledWith(2);
    expect(taskRepo.update).not.toHaveBeenCalled();
  });
});
